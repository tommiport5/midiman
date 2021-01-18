"use strict";
/**
 * Class KorgPatch
 * manages patches on an access virus
 * A single patch consists of 2 pages __A and __B
 * A multi patch consists of one buffer __C.
 */
 
// Must correspond to Korg Triton.html, TODO: transmit them here
const SingleBanks = "ABCDE HIJKLMN";				// This tells us, how to address the bank via midi
const MultiBanks =  "ABCDEHIJKLMN";
var NetSingleBanks = SingleBanks.replace(/ /g, '');	// This tells us, how the banks are stored: unused banks are not stored
var NetMultiBanks = MultiBanks.replace(/ /g, '');

 
// For tracing
var Combi = require('./sysex');
var Sysex = Combi.kg;

const _NOPP = 0x6e;
const _DLC = 0x23;

const _PPDR = 0x1C;
const _CPDR = 0x1D;
const _CPPD = 0x40;
const _CCPD = 0x49;
const _PPD = 0x4c;
const _CPD = 0x4d;

const LengthOfProg = 540;
const LengthOfCombi = 448;

function delay(ms) {
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve();
		}, ms);
	});
}
	
function hexblock(val) {
		let res = val.toString(16);
		if (res.length < 2) res =  ' 0x0' + res;
		else res = ' 0x' + res;
		return res;
}

function _getMidiLength(iLng) {
	var ml = Math.trunc(iLng/7)*8;
	if (iLng%7) ml += iLng%7 +1;
	return ml;
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

function _convertInt2Midi(intern) {
	let midi = [];
	for (let i=0; i<intern.length; i+= 7) {
		let carry = 0;
		let set = 1;
		for (let j=0; j<7; j++) {
			if (i+j >= intern.length) break;
			if (intern[i+j] & 0x80) carry |= set;
			set = set << 1;
		}
		midi.push(carry);
		for (let j=0; j<7; j++) {
			if (i+j >= intern.length) break;
			midi.push(intern[i+j] & 0x7f);
		}
	}
	return midi;
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

/**
 * class Mode
 * handles the operating mode of the synth
 */
class Mode {
	constructor() {
	}
	static #mode = undefined;
	static #MR = 0x12;
	static #MD = 0x42;
	static #MC = 0x4e;
	static get(mIn, mOut, mChan) {
		if (Mode.#mode) return Promise.resolve(Mode.#mode);
		return new Promise((resolve, reject) =>  {
			var mr = new Sysex(mChan, Mode.#MR);
			var ds = new Sysex();
			var Ret = ds.listen(mIn);
			mr.send(mOut);
			Ret.then((sx) => {
				if (sx.command  == Mode.#MD) {
					Mode.#mode = sx.raw[0];
					resolve(Mode.#mode);
				} else {
					reject(`Received ${sx.command.toString(16)} istead of ${Mode.#MD.toString(16)}`);
				}
			})
			.catch ((e) => {
				reject(e);
			});
		});
	}
	static set(mIn, mOut, mChan, new_mode) {
		return new Promise((resolve, reject) =>  {
			let mc = new Sysex(mChan, Mode.#MC);
			let ds = new Sysex();
			let Ret = ds.listen(mIn);
			mc.append([new_mode]);
			mc.send(mOut);
			Ret.then((sx) => {
				//console.log("0x" + sx.command.toString(16));
				setTimeout(() => {
					Mode.#mode = new_mode;
					resolve("Ok");
				}, 1000);
			});
		});
	}
}
	
	
	

class KorgPatch {
	constructor() {
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
	 * bankLetter2Index
	 * Converts the bank letter of a bank of type btp into the internal address,
	 * i.e the index into the "patches" array
	 */
	static bankLetter2Index(btp, letter) {
		if (btp == 'S')
			return NetSingleBanks.indexOf(letter);
		else
			return NetMultiBanks.indexOf(letter) + NetSingleBanks.length;
	}
	
	static getDeviceMode(mIn, mOut, mChan) {
		return Mode.get(mIn, mOut, mChan);
	}
	
	static _sendProgChange(mOut, mChan, to) {
		let bn = to.charCodeAt(1) - "A".charCodeAt(0);
		if (bn > 4) bn += 1;
		let s1 = 0xb0 + mChan;
		let s2 = 0xc0 + mChan;
		//console.log(/*s1,0,0,*/hexblock(s1),"0x20",hexblock(bn),hexblock(s2),hexblock(Number(to.substr(2))));				
		mOut/*.send(s1, [0,0])*/.send(s1,[0x20,bn]).send(s2, [Number(to.substr(2))]);
	}
	
	/**
	 * changeProg
	 * triggers a program change to the desired program /combi number.
	 * This may send a mode change first.
	 */
	static changeProg(mIn, mOut, mChan, to) {
		return new Promise((resolve,reject) => {
			//console.log(`Change to ${to}`);
			let combi = to[0]=='M'?0:2;
			Mode.get(mIn, mOut, mChan).then((dm) => {
				//console.log(`dm = ${dm}`); 
				if (combi != dm) {
					Mode.set(mIn, mOut, mChan, combi).then(() => {
						this._sendProgChange(mOut, mChan, to);
						resolve("Ok");
					});
				} else {
					this._sendProgChange(mOut, mChan, to);
					resolve("Ok");
				}
			}).catch(e => {
				reject(e);
			});
		});
	}
		

	/**
	 * readFromSynth
	 * reads the current edit patch into this object
	 */
	readFromSynth(mIn, mOut, mChan) {
		//Sysex.debug = true;
		return new Promise((resolve,reject) => {
			var rd = new Sysex(mChan, this._CurParDumpRequest);
			var ds = new Sysex();
			var Ret = ds.listen(mIn);
			rd.append([0]);
			rd.send(mOut);
			_handleResponse(Ret, mIn).then((sx) => {
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
	writeToSynth(mIn, mOut, mChan) {
		//Sysex.debug = true;
		if (!this._complete) {
			return Promise.reject("no patch");
		}
		return new Promise ((resolve, reject) => {
			try {
				var dump = new Sysex(mChan, this._CurParDump);
				var ds = new Sysex;
				var Ret = ds.listen(mIn);			
				dump.raw = [0];
				this.sanitize();
				dump.append(_convertInt2Midi(this.__sd));
				dump.send(mOut);
				Ret.then((sx) => {
					if (sx.command  == _DLC) {
						resolve("ok");
					} else {
						reject(`Could not write data, received 0x${sx.command.toString(16)}`);
					}
				});
			} catch(e) {
				console.log('exception occured in write to synth: ' + e);
				return Promise.reject(e);
			}
		});
	}
	
	writeToBlob() {
		var dump = new Sysex(0, this._CurParDump);	// the channel is just a placeholder
		dump.raw = [0];
		dump.append(_convertInt2Midi(this.__sd));
		let dat = dump.asBlob();
		return Buffer.from(Uint8Array.from(dat));
	}
	
	/**
	 * readFromBlob
	 * Reads a program or combi patch from a file that contains only one patch
	 * and returns it as a specific patch object (single or multi)
	 */
	static readFromBlob(ext, fbuf) {
		var patch;
		if (ext == ".syx") {
			if (fbuf[4] == _CPPD) { //F0, 42, 3g, 50   Excl Header,  4C Function
				patch = new KorgSinglePatch();
			} else if (fbuf[4] == _CCPD) {
				patch = new KorgMultiPatch();
			} else {
				throw `Cmd 0x${fbuf[4].toString(16)} instead of 0x${_CPPD.toString(16)} or 0x${_CCPD.toString(16)}`;
			}
			patch.__sd = _convertMidi2Int(fbuf.slice(6, -1));
		} else if (ext == ".bin") {
			if (fbuf.length == LengthOfProg) {
				patch = new KorgSinglePatch();
			} else if (fbuf.length == LengthOfCombi) {
				patch = new KorgMultiPatch();
			} else {
				throw `Illegal length of binary file: ${fbuf.length}`;
			}
			patch.__sd = fbuf;
		} else {
			throw `wrong extension ${ext}`;
		}	
		patch._complete = true;
		return patch;
	}
		
	
	/**
	 *readMemoryBankFromSynth
	 * Reads one bank. Returns a thenable with the 'type' letter
	 * and the array of patches (either Single or Multi patches).
	 */
	readMemoryBankFromSynth(mIn, mOut, mChan, postdat) {
		return new Promise((resolve,reject) => {
			var Result = new Array(128);
			let brq;
			let fillfunc;
			let ds = new Sysex();
			let Ret = ds.listen(mIn);
			brq = new Sysex(mChan, this._ParDumpRequest);
			brq.append([0x10 | postdat.Bank, 0, 0]);
			brq.send(mOut);
			_handleResponse(Ret, mIn).then((sx) => {
				if (sx.command == 0x24) reject(`Data load error ${sx.raw[0]}`);
				if (sx.raw[0] & 1) reject(`MOSS board not supported: ${sx.raw[0]}`);
				let IData = _convertMidi2Int(sx.raw.slice(3));
				this.fillFromSysex(Result, IData);
				setTimeout(() => {
					resolve({pat:Result, type:postdat.type});
				}, 1000);
			}).catch ((e) =>{
				console.log('exception occured in readMemoryBankFromSynth: ' + e);
				reject(e);
			});
		});
	}
	
	/**
	 * writeMemoryToSynth
	 * writes the current bank in Mem to the Synth.
	 */
	writeMemoryBankToSynth(Mem, mIn, mOut, mChan, postdat) {
		return new Promise((resolve, reject) => {
			let dump = this.buildSysex(Mem, postdat.bnk[1], mChan);
			let ds = new Sysex;
			let Ret = ds.listen(mIn);			
			dump.send(mOut);	
			Ret.then((sx) => {
				if (sx.command  == _DLC)
					resolve("ok");
				else
					reject(`Could not write data, received 0x${sx.command.toString(16)}`);
			});
		});
	}

	static readMemoryFromBlob(fbuf) {
		var Result = [];
		var som;
		var btp;
		var ml;
		if (fbuf[0] != 0xf0) throw "Not a sysex file";
		som = 0;
		while (som < fbuf.length) {
			let bank = [];
			let patch;
			let iData;
			if (fbuf[som+4] == _PPD) { //F0, 42, 3g, 50   Excl Header,  4C                      Function
				btp = 'S';
				ml = _getMidiLength(LengthOfProg*128);
			} else if (fbuf[som+4] == _CPD) {
				btp = 'M';
				ml = _getMidiLength(LengthOfCombi*128);
			} else {
				throw `Cmd 0x${fbuf[som+4].toString(16)} instead of 0x${_PPD.toString(16)} or 0x${_CPD.toString(16)}`;
			}
			som += 8;		// TODO: some more checking
			iData = _convertMidi2Int(fbuf.slice(som, som + ml));
			for (let i=0; i<128; i++) {
				if (btp == 'S')
					patch = new KorgSinglePatch();
				else 
					patch = new KorgMultiPatch();
				patch.__sd = iData.slice(i*patch.dlength, (i+1)*patch.dlength);
				patch._complete = true;
				bank.push(patch);
			}
			Result.push({pat:bank, type:btp});
			som += ml+1;
			if (som >= fbuf.length) break;	//preemptive termination is ok
			if (fbuf[som] != 0xf0) 
				throw "Syntax error in sysex file";
		}
		return Result;
	}
	
	/**
	 * writeMemoryToBlob
	 * constructs a.asBlob from all the banks in datarr converted into sysexes
	 * implementation:
	 * iterate over all the banks in datarr
	 *		make one sysex and concat it to the blob
	 */
	static writeMemoryToBlob(datarr) {
		var dat = [];
		var i = 0;
		var BankTypeObject;
		datarr.forEach((bank) => {
			if (bank.type == 'S') {
				BankTypeObject = new KorgSinglePatch();
			} else {
				BankTypeObject = new KorgMultiPatch();
			}			
			let BankDump = BankTypeObject.buildSysex(datarr, BankTypeObject.index2BankLetter(i), 0);
			dat = dat.concat(BankDump.asBlob());
			i++;
		});
		return Buffer.from(Uint8Array.from(dat));
	}
	
	/**
	 * buildSysex
	 * will build a Sysex from a whole bank.
	 * Same code will work for both descendants.
	 */
	buildSysex(Mem, Bank, mChan) {
		var bank = this.bankLetter2Ext(Bank);	
		var dump = new Sysex(mChan, this._ParDump);
		dump.raw = [2, 0x10|bank, 0];
		var idata = [];
		Mem[this.bankLetter2Index(Bank)].pat.forEach((pt)=> {
			idata = idata.concat(pt.__sd);
		});
		dump.append(_convertInt2Midi(idata));
		return dump;
	}

	
	/**
	 * test
	 * checks, if a round trip thru the synth changes the clipboard patch
	 */
	test(mIn, mOut, mChan, postdat) {
		//Sysex.trace = true;
		console.log(`Testing ${this.patchname}`);
		return new Promise((resolve,reject) => {
			let save = this.__sd;
			this.writeToSynth(mIn, mOut, mChan)
				.then(() => {
					return this.readFromSynth(mIn, mOut, mChan);
				})
				.then(() => {
					resolve(this.diffTo(save));
				})
				.catch((e) => {
					reject(e);
				});
		});
	} 
	
	// performs the actual comparison
	_diffTo(pat, minor) {
		let rep;
		let minor_fail = false;
		if (!pat) return {changed:2, text:"Comparison data undefined"};
		if (pat.length != this.dlength) console.log(`Size mismatch: ${pat.length} instead of ${this.dlength}`);
		let size = pat.length < this.dlength ? pat.length : this.dlength;
		for (let ind=0; ind < size; ind ++) {
			if (this.__sd[ind] != pat[ind]) {
				console.log(`${ind}: 0x${pat[ind].toString(16)} -> 0x${this.__sd[ind].toString(16)}`);
				if (minor && minor.includes(ind)) {minor_fail = true;  continue;}
				if (!rep) rep = [ind, pat[ind], this.__sd[ind]];
			}
		}
		if (rep) return {changed:2, text: `Byte ${rep[0]} changed from 0x${rep[1].toString(16)} to 0x${rep[2].toString(16)}`};
		if (minor_fail) return {changed:1};
		return {changed:0};
	}
}
	

class KorgSinglePatch extends KorgPatch {
	constructor () {
		super();
		this.dlength = LengthOfProg;
		this._CurParDumpRequest = 0x10;
		this._CurParDump = 0x40;
		this._ParDumpRequest = _PPDR;
		this._ParDump = _PPD;
	}
	
	fillFromSysex(Result, idata) {
		for (let i=0; i <128; i++) {
			Result[i] = new KorgSinglePatch();
			Result[i].__sd = idata.slice(i*this.dlength,(i+1)*this.dlength);
			if (Array.isArray(Result[i].__sd)) Result[i]._complete = true;
			else Result[i].__sd = Uint8Array.from("Transmission Error");
		}
	}
	
	/**
	 * bankLetter2Ext
	 * Converts the bank letter of a single bank into the external address,
	 * i.e the bank value in the midi telegram
	 */
	bankLetter2Ext(letter) {
		return SingleBanks.indexOf(letter);
	}

	/**
	 * bankLetter2Index
	 * Converts the bank letter of a bank of type btp into the internal address,
	 * i.e the index into the "patches" array
	 */
	bankLetter2Index(letter) {
		return NetSingleBanks.indexOf(letter);
	}
	
	index2BankLetter(i) {
		return NetSingleBanks[i];
	}
	
	fillFromBlob(fbuf, som) {
		this.__sd = fbuf.slice(som, som+this.dlength);
		this._complete = true;
	}
	
	/**
	 * sanitize
	 * fixes illegal value combinations in the patch. The synthesizer seems to fix them "on the fly" while loading them,
	 * but when the patch is sent via sysex, it breaks the engine :-(
	 */
	sanitize() {
		if (!this.__sd) return; // nothing to fix
/*		
		let vp = this.__sd.slice(34,36).concat(this.__sd.slice(58,60), this.__sd.slice(82,84), this.__sd.slice(106,108), this.__sd.slice(130,132));
		console.log('Valve effect parameters: ' +  vp.map(hexblock));
		console.log('Master effect parameters: ' +  this.__sd.slice(136,154).map(hexblock));
*/
		// change the outputs of all insert effects from 3/4 to L/R, because the valve
		// will be forced to L/R
		for (let ieff=16; ieff <= 112; ieff += 24) {
			if ((this.__sd[ieff+17] & 0x80) == 0) {
				if (this.__sd[ieff+21] = 6)
					this.__sd[ieff+21] = 0;
			}
		}
	}
	
	// filter out the known changes from the valve effect
	// and the MSBit from ST BPM Long Dly
	diffTo(pat) {
		const valve = [34,35,49,58,59,82,83,106,107,130,131];
		let res = this._diffTo(pat, valve);
		switch (res.changed) {
			case 0:
				return "All bytes correctly compared equal";
			case 1:
				return "Patch compared equivalent";
			case 2:
				return res.text;
		}
	}
	isA() {return "KorgProgramPatch";}	
}

class KorgMultiPatch extends KorgPatch {
	constructor () {
		super();
		this.dlength = LengthOfCombi;
		this._CurParDumpRequest = 0x19;
		this._CurParDump = 0x49;
		this._ParDumpRequest = _CPDR;
		this._ParDump = _CPD;
	}
	
	fillFromSysex(Result, idata) {
		for (let i=0; i <128; i++) {
			Result[i] = new KorgMultiPatch();
			Result[i].__sd = idata.slice(i*this.dlength,(i+1)*this.dlength);
			if (Array.isArray(Result[i].__sd)) Result[i]._complete = true;
			else Result[i].__sd = Uint8Array.from("Transmission Error");
		}
	}

	/**
	 * bankLetter2Ext
	 * Converts the bank letter of of a multi bank into the externel address,
	 * i.e the bank value in the midi telegram
	 */
	bankLetter2Ext(letter) {
		return MultiBanks.indexOf(letter);
	}
	
	/**
	 * bankLetter2Index
	 * Converts the bank letter of a mult bank into the internal address,
	 * i.e the index into the "patches" array
	 */
	bankLetter2Index(letter) {
		return NetMultiBanks.indexOf(letter) + NetSingleBanks.length;
	}
	index2BankLetter(i) {
		return NetMultiBanks[i-NetSingleBanks.length];
	}	
	
	fillFromBlob(fbuf, som) {
		this.__sd = fbuf.slice(som, som+this.dlength);
		this._complete = true;
	}

	sanitize() {
		// nothing to fix (so far)
	}
	
	diffTo(pat) {
		let res = this._diffTo(pat);
		switch (res.changed) {
			case 0:
				return "All bytes correctly compared equal";
			case 1:
				return "Patch compared equivalent";
			case 2:
				return changed.text;
		}
	}
	
	isA() {return "KorgCombiPatch";}
}

exports.base = KorgPatch;
exports.single = KorgSinglePatch;
exports.multi = KorgMultiPatch;
		


