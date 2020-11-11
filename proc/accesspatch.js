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

const SingleWriteBanks ="AB";
const MultiWriteBanks = "M"


function delay(ms) {
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve();
		}, ms);
	});
}

class AccessPatch {
	constructor(MIn, MOut, MChan) {
		this.mIn = MIn;
		this.mOut = MOut;
		this.mChan = MChan;
		this._complete = false;
	}
	
	get complete() {
		return this._complete;
	}
	
	/**
	 * readFromSynth
	 * reads the current (single) edit patch into this object
	 */
	readFromSynth() {
		return new Promise((resolve,reject) => {
			try {
				var rd = new Sysex(this.mChan, _SIR);
				var ds = new Sysex();
				var Ret = ds.listen(this.mIn);
				rd.append([0,0x40]);
				rd.send(this.mOut);
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
		this.mOut = mOut;
		this.mChan = mChan;		// override the stored values
		// Sysex.trace = true;
		if (!this._complete) {
			return Promise.reject("no patch");
		}
		try {
			var dump = this.buildSysex(0, 0x40);	//the program number is ignored for the multi request, 
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
	static async readMemoryBankFromSynth(mIn, mOut, mChan, postdat) {
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
				brq.append([1]);
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
			return Result;
		} catch(e) {
			console.log('exception occured in readMemory: ' + e);
			throw e;
		}			
	}

	static readMemoryFromBlob(fbuf) {
		var Result = [];
		var som;
		var eom;
		if (fbuf[0] != 0xf0) throw "Not a sysex file";
		som = 1;
		while (som < fbuf.length) {
			let bank = [];
			let patch;
			for (let i=0; i<128; i++) {
				eom = fbuf.indexOf(0xf7, som);
				if (fbuf[som+5] == _SID) { //3 id, 1 prod, 1 dev, 1 cmd, 1 bnum, 1 pnum
					patch = new AccessSinglePatch();
				} else if (fbuf[som+5] == _MUD) {
					patch = new AccessMultiPatch();
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
			Result.push(bank);
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
			bank.forEach((pt)=> {
				let pts = pt.buildSysex(bnum, pnum);
				dat = dat.concat(pts.asBlob());
				pnum++;
			});
			bnum++;
		});
		return Buffer.from(Uint8Array.from(dat));
	}
	
	static writePatchToBlob(pat) {
		let pts = pat.buildSysex();
		let dat = pts.asBlob();
		return Buffer.from(Uint8Array.from(dat));
	}
	
	/**
	 * writeMemoryToSynth
	 * writes all the banks in Mem to the Synth.
	 */
	static writeMemoryToSynth(Mem, mOut, mChan) {
		for (let i=0; i< SingleWriteBanks.length; i++) {
			if (SingleWriteBanks[i] == ' ') continue;
			let pnum = 0;
			Mem[i].forEach((pt)=> {
				pt.mOut = mOut;
				pt.mChan = mChan;		// override the stored values
				let pts = pt.buildSysex(i+1, pnum);
				pts.send(mOut);
				pnum++;
			});
		}
		for (let i=0; i< MultiWriteBanks.length; i++) {
			if (MultiWriteBanks[i] == ' ') continue;
			let pnum = 0;
			Mem[i].forEach((pt)=> {
				pt.mOut = mOut;
				pt.mChan = mChan;		// override the stored values
				let pts = pt.buildSysex(i+1, pnum);
				pts.send(mOut);
				pnum++;
			});
		}
	}
}

class AccessSinglePatch extends AccessPatch {
	constructor (MIn, MOut, MChan) {
		super(MIn, MOut, MChan);
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
	
	fillFromSysex(sx) {
		let add = sx.raw.slice(0,2);
		let sxd = sx.raw.slice(2);
		this.__A = sxd.slice(0,128);
		this.__B = sxd.slice(128);				// I don't know, if this would be the right place
		this._complete = true;
	}
	
	fillFromBlob(fbuf, som, eom) {
		this.__A = fbuf.slice(som+8,som+136);	
		this.__B = fbuf.slice(som+136, eom-1);   	// I don't know, if this is the right place
		this._complete = true;
	}

	buildSysex(bnum, pnum) {
		let pts = new Sysex(this.mChan, _SID);
		if (!bnum)
			pts.append([0,0x40]);
		else
			pts.append([bnum, pnum]);
		pts.append(this.__A);
		pts.append(this.__B);
		return pts;
	}
}

class AccessMultiPatch extends AccessPatch {
	constructor (MIn, MOut, MChan) {
		super(MIn, MOut, MChan);
	}
	get patchname() {
		var res = "";
		this.__C.slice(3,14).reduce((total, val) => {res += String.fromCharCode(val);});
		return res;
	}
	
	fillFromSysex(sx) {
		let add = sx.raw.slice(0,2);
		let sxd = sx.raw.slice(2);
		this.__C = sxd;
		this._complete = true;
	}
	
	fillFromBlob(fbuf, som, eom) {
		this.__C = fbuf.slice(som+8, eom);
		this._complete = true;
	}
	
	buildSysex(bnum, pnum) {
		let pts = new Sysex(this.mChan, _MUD);
		if (!bnum)
			pts.append([0,0]);
		else
			pts.append([bnum, pnum]);
		pts.append(this.__C);
		return pts;
	}
}

exports.base = AccessPatch;
exports.single = AccessSinglePatch;
exports.multi = AccessMultiPatch;
		


