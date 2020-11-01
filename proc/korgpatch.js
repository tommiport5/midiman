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
const _PPDR = 0x1C;
const _NOPP = 0x6e;
const _MBR = 0x33;
const _CPPD = 0x40;
const _MUD = 0x11;

const WriteBanks = [1,2];

function delay(ms) {
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve();
		}, ms);
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
	
	_convertMidi2Int(midi) {
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
	
	static _handleResponse(Ret, mIn, func) {
		Ret.then((sx) => {
			if (sx.command == _NOPP) {
				let nds = new Sysex();
				let nRet = nds.listen(mIn);
				KorgPatch._handleResponse(nRet, mIn, func);
			} else {
				func(sx);
			}
		}).catch((e) => {
			console.log("readFromSynth: " + e);
			throw e;
		});
	}
			
		
	
	/**
	 * readFromSynth
	 * reads the current (single) edit patch into this object
	 */
	readFromSynth() {
		Sysex.trace = true;
		return new Promise((resolve,reject) => {
			try {
				var rd = new Sysex(this.mChan, _CPPDR);
				var ds = new Sysex();
				var Ret = ds.listen(this.mIn);
				rd.append([0]);
				rd.send(this.mOut);
				KorgPatch._handleResponse(Ret, this.mIn, (sx) => {
					this.fillFromSysex(sx);
					resolve("ok");
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
	 * reads the internal memory and returns an array of KorgPatch objects
	 * cannot read all banks in one go, because the browser gets unpatient :-(
	 *
	 * This should be part of some factory class.
	 */
	static async readMemoryBankFromSynth(mIn, mOut, mChan, bank) {
		try {
			var brq;
			var resp;
			var ds = new Sysex();
			var Result = new Array(128);
			if (bank < 8) {
				brq = new Sysex(mChan, _SBR);
				brq.append([bank+1]);
			} else {
				// Bank8 is the multi bank
				brq = new Sysex(mChan, _MBR);
				brq.append([1]);
			}
			brq.send(mOut);
			for (let prog = 0; prog < 128; prog++) {
				let Ret = ds.listen(mIn);
				let sx = await Ret;
				resp = sx.command;
				if (resp == _SID) {
					Result[prog] = new KorgSinglePatch();
				} else if (resp == _MUD) {
					Result[prog] = new KorgMultiPatch();
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
	
	fillFromSysex(sx) {
		if (sx.raw.shift()) console.log("Got MOSS patch instead of PCM patch");
		this.__sd = this._convertMidi2Int(sx.raw);
		this._complete = true;
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

exports.base = KorgPatch;
exports.single = KorgSinglePatch;
exports.multi = KorgMultiPatch;
		


