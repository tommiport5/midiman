"use strict";
/**
 * Class AccessPatch
 * manages patches on an access virus
 * A single patch consists of 2 pages __A and __B
 * A multi patch consists of one buffer __C.
 */
 
// For tracing
var Combi = require('./sysex');
var Sysex = Combi.as;

const _SIR = 0x30;
const _MUR = 0x31;
const _SBR = 0x32;
const _MBR = 0x33;
const _SID = 0x10;
const _MUD = 0x11;

const NetSingleBanks ="ABCDEFGH";
const NetMultiBanks = "M";
const WritableBanks = [0,1,8];

function delay(ms) {
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve();
		}, ms);
	});
}

class AccessPatch {
	constructor() {
		this._complete = false;
	}
	
	get complete() {
		return this._complete;
	}
	
	/**
	 * bankLetter2Index
	 * seems like overkill here, but is useful with something like the Triton
	 */
	static bankLetter2Index(btp, letter) {
		if (btp == 'S')
			return NetSingleBanks.indexOf(letter);
		else
			return NetMultiBanks.indexOf(letter) + NetSingleBanks.length;
	}
	
	
	/**
	 * readFromSynth
	 * reads the current (single) edit patch into this object
	 */
	readFromSynth(mIn, mOut, mChan) {
		return new Promise((resolve,reject) => {
			try {
				var rd = new Sysex(mChan, _SIR);
				var ds = new Sysex();
				var Ret = ds.listen(mIn);
				rd.append([0,0x40]);
				rd.send(mOut);
				Ret.then((sx) => {
					this.fillFromSysex(sx);
					resolve("ok");
				}).catch ((e) =>{
					console.log("readFromSynth: " + e);
					reject(e);
				});
			} catch(e) {
				console.log('exception occured in read from synth: ' + e);
				reject(e);
			}
		});
	}
	
	/**
	 * writeToSynth
	 * writes this patch into the current edit patch on the synth
	 */
	writeToSynth(mOut, mChan) {
		// Sysex.trace = true;
		if (!this._complete) {
			return Promise.reject("no patch");
		}
		try {
			var dump = this.buildSysex(0, 0x40, mChan);	//the program number is ignored for the multi request, 
													// so this works for multi and single
			dump.send(mOut);
			return Promise.resolve("ok");
		} catch(e) {
			console.log('exception occured in write to synth: ' + e);
			return Promise.reject(e);
		}
	}
				

	/**
	 * readMemory
	 * reads the internal memory and returns an array of AccessPatch objects
	 * cannot read all banks in one go, because the browser gets unpatient :-(
	 */
	async readMemoryBankFromSynth(mIn, mOut, mChan, postdat) {
		//Sysex.trace = true;
		try {
			var brq;
			var resp;
			var ds = new Sysex();
			var Result = new Array(128);
			if (postdat.type == 'S') {
				brq = new Sysex(mChan, _SBR);
				brq.append([postdat.Bank+1]);
			} else {
				brq = new Sysex(mChan, _MBR);
				brq.append([postdat.Bank+1]);
			}
			brq.send(mOut);
			for (let prog = 0; prog < 128; prog++) {
				let Ret = ds.listen(mIn);
				let sx = await Ret;
				resp = sx.command;
				if (resp == _SID) {
					Result[prog] = new AccessSinglePatch();
				} else if (resp == _MUD) {
					Result[prog] = new AccessMultiPatch();
				}
				Result[prog].fillFromSysex(sx);
			}
			await delay(1000);
			return {pat:Result,type:postdat.type};
		} catch(e) {
			console.log('exception occured in readMemory: ' + e);
			throw e;
		}			
	}

	/**
	 * writeMemoryToSynth
	 * writes all the banks in Mem to the Synth.
	 */
	static writeMemoryBankToSynth(Mem, mOut, mChan, postdat) {
		let pnum = 0;
		let i = (NetSingleBanks+NetMultiBanks).indexOf(postdat.bnk[1]);
		if (!WritableBanks.includes(i)) throw `Bank ${postdat.bnk[1]} is not writable`;
		Mem[i].pat.forEach((pt)=> {
			let pts = pt.buildSysex(i+1, pnum, mChan);
			pts.send(mOut);
			pnum++;
		});
	}
	
	static readMemoryFromBlob(fbuf) {
		var Result = [];
		var som;
		var eom;
		var btp;
		if (fbuf[0] != 0xf0) throw "Not a sysex file";
		som = 1;
		while (som < fbuf.length) {
			let bank = [];
			let patch;
			for (let i=0; i<128; i++) {
				eom = fbuf.indexOf(0xf7, som);
				if (fbuf[som+5] == _SID) { //3 id, 1 prod, 1 dev, 1 cmd, 1 bnum, 1 pnum
					patch = new AccessSinglePatch();
					btp = 'S';
				} else if (fbuf[som+5] == _MUD) {
					patch = new AccessMultiPatch();
					btp = 'M';
				} else {
					throw `Cmd not ${_SID} or ${_MUD}`;
				}
				patch.fillFromBlob(fbuf, som, eom);
				bank.push(patch);
				som = eom+2;
				if (som >= fbuf.length) break;	//preemptive termination is ok
				if (fbuf[eom+1] != 0xf0) 
					throw "Syntax error in sysex file";
			}
			Result.push({pat:bank, type:btp});
		}
		return Result;
	}
	
	/**
	 * writeMemoryToBlob
	 * constructs a.asBlob from all the patches in datarr converted into sysexes
	 * implementation:
	 * iterate over all the banks in datarr
	 *		iterate over all the patches
	 *			make one sysex and concat it to the blob
	 */
	static writeMemoryToBlob(datarr) {
		var dat = [];
		let bnum = 1;
		datarr.forEach((bank) => {
			let pnum = 0;
			bank.pat.forEach((pt)=> {
				let pts = pt.buildSysex(bnum, pnum, 0); 	// make the channel always 0 on the stored blob
				dat = dat.concat(pts.asBlob());
				pnum++;
			});
			bnum++;
		});
		return Buffer.from(Uint8Array.from(dat));
	}
	
	static writePatchToBlob(pat) {
		let pts = pat.buildSysex(0, 0, 0);
		let dat = pts.asBlob();
		return Buffer.from(Uint8Array.from(dat));
	}
	
	/**
	 * test
	 * checks, if a round trip thru the synth changes the clipboard patch
	 */
	test(mIn, mOut, mChan, postdat) {
		console.log(`Testing patch ${this.patchname}`);
		return new Promise((resolve,reject) => {
			// let iData = _convertMidi2Int(_convertInt2Midi(this.__sd));
			let save = this.save();
			//console.log("Writing clipboard to synth");
			this.writeToSynth(mOut, mChan)
				.then(() => {
					//console.log("Reading back");
					this.clear();
					return this.readFromSynth(mIn, mOut, mChan);
				})
				.then(() => {
					//console.log("Comparing");
					resolve(this.compare(save));
				})
				.catch((e) => {
					reject(e);
				});
		});

	}
	
	_comparePart(a, b, rep, name) {
		if (a.length != b.length) console.log(`size mismatch ${name}`);
		let lng = (a.length > b.length) ? b.length : a.length;
		for (let ind=0; ind < lng; ind ++) {
			if (a[ind] != b[ind]) {
				console.log(`${name}[${ind}]: 0x${a[ind].toString(16)} -> 0x${b[ind].toString(16)}`);
				if (!rep) rep = [ind, a[ind], b[ind], name];
			}
		}
		return rep;
	}
	
}

class AccessSinglePatch extends AccessPatch {
	constructor () {
		super();
	}
	get patchname() {
		var res = "";
		if (this.__B == undefined) {
			res = "<undefined>";
		} else {
			this.__B.slice(112,122).forEach((val) => {res += String.fromCharCode(val);});
			if (!this._complete) res += " <incomplete>";
		}
		return res;
	}
	
	clear() {
		this.__A = undefined;
		this.__B = undefined;	
		this._complete = false;
	}
	
	save() {
		return {__A : this.__A, __B: this.__B};
	}
	
	fillFromSysex(sx) {
		let add = sx.raw.slice(0,2);
		let sxd = sx.raw.slice(2);
		this.__A = sxd.slice(0,128);
		this.__B = sxd.slice(128);	
		this._complete = true;
	}
	
	fillFromBlob(fbuf, som, eom) {
		this.__A = fbuf.slice(som+8,som+136);	
		this.__B = fbuf.slice(som+136, eom-1);   	// must remove checksum, like SysEx._parseTelegram would
		this._complete = true;
	}

	buildSysex(bnum, pnum, mChan) {
		let pts = new Sysex(mChan, _SID);
		if (!bnum)
			pts.append([0,0x40]);	// current patch
		else
			pts.append([bnum, pnum]);
		pts.append(this.__A);
		pts.append(this.__B);
		return pts;
	}

	compare(pat) {
		// Partameters__A[1..3], seem to be controller values and may differ
		// Paramter __A[0] ist the sound version, different sound versions are not comparable
		if (this.__A[0] != pat.__A[0]) return `Sound version changed from ${pat.__A[0]} to ${this.__A[0]}, not comparable`;
		this.__A[1] = pat.__A[1];		
		this.__A[2] = pat.__A[2];		
		this.__A[3] = pat.__A[3];
		let rep = this._comparePart(pat.__A, this.__A, undefined, '__A');
		rep = this._comparePart(pat.__B, this.__B, rep, '__B');			
		if (!rep) return "All bytes correctly compared equal";
		else return `Byte ${rep[0]} of ${rep[3]} changed from 0x${rep[1].toString(16)} to 0x${rep[2].toString(16)}`;
	}
}

class AccessMultiPatch extends AccessPatch {
	constructor () {
		super();
	}
	get patchname() {
		var res = "";
		this.__C.slice(3,14).reduce((total, val) => {res += String.fromCharCode(val);});
		return res;
	}
	
	clear() {
		this.__C = undefined;
		this._complete = false;
	}
	
	save() {
		return {__C : this.__C};
	}
	
	fillFromSysex(sx) {
		let add = sx.raw.slice(0,2);
		let sxd = sx.raw.slice(2);
		this.__C = sxd;
		this._complete = true;
	}
	
	fillFromBlob(fbuf, som, eom) {
		this.__C = fbuf.slice(som+8, eom-1); // must remove checksum, like SysEx._parseTelegram would
		this._complete = true;
	}
	
	buildSysex(bnum, pnum, mChan) {
		let pts = new Sysex(mChan, _MUD);
		if (!bnum)
			pts.append([0,0]);
		else
			pts.append([1, pnum]);	// access has only one multi bank
		pts.append(this.__C);
		return pts;
	}
	
	compare(pat) {
		let rep = this._comparePart(pat.__C, this.__C, undefined, '__C');
		if (!rep) return "All bytes correctly compared equal";
		else return `Byte ${rep[0]} of ${rep[3]} changed from 0x${rep[1].toString(16)} to 0x${rep[2].toString(16)}`;
	}
}

exports.base = AccessPatch;
exports.single = AccessSinglePatch;
exports.multi = AccessMultiPatch;
		


