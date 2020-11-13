"use strict";
/**
 * Class KorgPatch
 * manages patches on an access virus
 * A single patch consists of 2 pages __A and __B
 * A multi patch consists of one buffer __C.
 */
 
// For tracing
var Combi = require('./sysex');
var Sysex = Combi.kg;

const _MR = 0x12;
const _CPPDR = 0x10;
const _CPPD = 0x40;
const _PPDR = 0x1C;
const _PPD = 0x4C;
const _CPDR = 0x1D;
const _CPD = 0x4D;
const _NOPP = 0x6e;
const _MBR = 0x33;
const _MUD = 0x11;

const WriteBanks = [1,2];

function delay(ms) {
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve();
		}, ms);
	});
}

function _convertMidi2Int(midi) {
	let intern = [];
	for (let i=0; i< midi.length; i+=8) {
		let carry = midi[i];
		let scan = 1;
		for (let j=1; j<8; j++) {
			if (i+j>=midi.length) break;
			if (scan&carry)
				intern.push(midi[i+j] | 0x80);
			else
				intern.push(midi[i+j]);
			scan = scan<<1;
		}
	}
	return intern;
}
	
function _handleResponse(Ret, mIn) {
	return new Promise((resolve,reject) => {
		Ret.then((sx) => {
			if (sx.command == _NOPP) {
				let nds = new Sysex();
				let nRet = nds.listen(mIn);
				resolve(_handleResponse(nRet, mIn));
			} else {
				resolve(sx);
			}
		}).catch((e) =>{
			console.log('exception occured in _handleResponse: ' + e);
			reject(e);
		});
	});
}

class KorgPatch {
	constructor(MIn, MOut, MChan) {
		this.mIn = MIn;
		this.mOut = MOut;
		this.mChan = MChan;
		this._complete = false;
	}
	
	get complete() {
		return this._complete;
	}	
	
	get patchname() {
		var res = "";
		if (this.__sd == undefined) {
			res = "<undefined>";
		} else {
			this.__sd.slice(0,16).forEach((val) => {
					res += String.fromCharCode(val);
				});
			if (!this._complete) res += " <incomplete>";
		}
		return res;
	}

	/**
	 * readFromSynth
	 * reads the current (single) edit patch into this object
	 */
	readFromSynth() {
		Sysex.trace = true;
		return new Promise((resolve,reject) => {
			var rd = new Sysex(this.mChan, _CPPDR);
			var ds = new Sysex();
			var Ret = ds.listen(this.mIn);
			rd.append([0]);
			rd.send(this.mOut);
			_handleResponse(Ret, this.mIn).then((sx) => {
				if (sx.raw.shift()) console.log("Got MOSS patch instead of PCM patch");
				this.__sd = _convertMidi2Int(sx.raw);
				this._complete = true;
				resolve("ok");
			}).catch((e) =>{
				console.log('exception occured in read from synth: ' + e);
				reject(e);
			});
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
				
	static _readOneBank(Result, mIn, mOut, mChan, postdat) {
		return new Promise((resolve,reject) => {
			let brq;
			let fillfunc;
			let ds = new Sysex();
			let Ret = ds.listen(mIn);
			if (postdat.type == 'S') {
				brq = new Sysex(mChan, _PPDR);
				brq.append([0x10 | postdat.Bank, 0, 0]);
				fillfunc = KorgSinglePatch.fillFromSysex;
			} else {
				brq = new Sysex(mChan, _CPDR);
				brq.append([0x10 | postdat.Bank, 0, 0]);
				fillfunc = KorgMultiPatch.fillFromSysex;
			}			
			brq.send(mOut);
			_handleResponse(Ret, mIn).then((sx) => {
				if (sx.command == 0x24) reject(`Data load error ${sx.raw[0]}`);
				if (sx.raw[0] & 1) reject(`MOSS board not supported: ${sx.raw[0]}`);
				let IData = _convertMidi2Int(sx.raw.slice(3));
				fillfunc(Result, IData);
				setTimeout(() => {
					resolve();
				}, 1000);
			}).catch ((e) =>{
				console.log('exception occured in _readOneBank: ' + e);
				reject(e);
			});
		});
	}
	
	/**
	 * readMemory
	 * reads the internal memory and returns an array of KorgPatch objects
	 * cannot read all banks in one go, because the browser gets unpatient :-(
	 *
	 * This should be part of some factory class.
	 */
	static readMemoryBankFromSynth(mIn, mOut, mChan, postdat) {
		Sysex.trace = true;
		return new Promise((resolve,reject) => {
				var Result = new Array(128);
				KorgPatch._readOneBank(Result, mIn, mOut, mChan, postdat).then(function() {
					resolve(Result);
			}).catch ((e) =>{
				console.log('exception occured in readMemory: ' + e);
				reject(e);
			});
		});
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
					patch = new KorgSinglePatch();
				} else if (fbuf[som+5] == _MUD) {
					patch = new KorgMultiPatch();
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
		for (let bank of WriteBanks) {
			let pnum = 0;
			Mem[bank-1].forEach((pt)=> {
				pt.mOut = mOut;
				pt.mChan = mChan;		// override the stored values
				let pts = pt.buildSysex(bank, pnum);
				pts.send(mOut);
				pnum++;
			});
		}
		let pnum = 0;
		Mem[8].forEach((pt)=> {
			pt.mOut = mOut;
			pt.mChan = mChan;		// override the stored values
			let pts = pt.buildSysex(1, pnum);
			pts.send(mOut);
			pnum++;
		});
	}
}

class KorgSinglePatch extends KorgPatch {
	constructor (MIn, MOut, MChan) {
		super(MIn, MOut, MChan);
	}
	
	static fillFromSysex(Result, idata) {
		const dlength = 540; 
		for (let i=0; i <128; i++) {
			Result[i] = new KorgSinglePatch();
			Result[i].__sd = idata.slice(i*dlength,(i+1)*dlength);
			if (Array.isArray(Result[i].__sd)) Result[i]._complete = true;
			else Result[i].__sd = Uint8Array.from("Transmission Error");
		}
	}
	
	fillFromBlob(fbuf, som, eom) {
		this.__A = fbuf.slice(som+8,som+136);	
		this.__B = fbuf.slice(som+136, eom);
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

class KorgMultiPatch extends KorgPatch {
	constructor (MIn, MOut, MChan) {
		super(MIn, MOut, MChan);
	}
	
	static fillFromSysex(Result, idata) {
		const dlength = 448; 
		for (let i=0; i <128; i++) {
			Result[i] = new KorgMultiPatch();
			Result[i].__sd = idata.slice(i*dlength,(i+1)*dlength);
			if (Array.isArray(Result[i].__sd)) Result[i]._complete = true;
			else Result[i].__sd = Uint8Array.from("Transmission Error");
		}
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

exports.base = KorgPatch;
exports.single = KorgSinglePatch;
exports.multi = KorgMultiPatch;
		


