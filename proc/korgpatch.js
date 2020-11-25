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
const _PPD = 0x4c;
const _CPDR = 0x1D;
const _CPD = 0x4d;

function delay(ms) {
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve();
		}, ms);
	});
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

class KorgPatch {
	
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

	/**
	 * readFromSynth
	 * reads the current (single) edit patch into this object
	 */
	readFromSynth(mIn, mOut, mChan) {
		Sysex.trace = true;
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
		//Sysex.trace = true;
		if (!this._complete) {
			return Promise.reject("no patch");
		}
		return new Promise ((resolve, reject) => {
			try {
				var dump = new Sysex(mChan, this._CurParDump);
				var ds = new Sysex;
				var Ret = ds.listen(mIn);			
				dump.raw = [0];
				dump.append(_convertInt2Midi(this.__sd));
				dump.send(mOut);
				Ret.then((sx) => {
					if (sx.command  == _DLC)
						resolve("ok");
					else
						reject(`Could not write data, received 0x${sx.command.toString(16)}`);
				});
			} catch(e) {
				console.log('exception occured in write to synth: ' + e);
				return Promise.reject(e);
			}
		});
	}
	
	static writePatchToBlob(pat) {
		var dump = new Sysex(0, pat._CurParDump);	// the channel is just a placeholder
		dump.raw = [0];
		dump.append(_convertInt2Midi(pat.__sd));
		let dat = pts.asBlob();
		return Buffer.from(Uint8Array.from(dat));
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
	writeMemoryToSynth(Mem, mIn, mOut, mChan, postdat) {
		return new Promise((resolve, reject) => {
			let dump = this.buildSysex(Mem, postdat.bnk[1], mChan);
			dump.send(mOut);	
			let ds = new Sysex;
			let Ret = ds.listen(mIn);			
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
				ml = _getMidiLength(540*128);
			} else if (fbuf[som+4] == _CPD) {
				btp = 'M';
				ml = _getMidiLength(448*128);
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
}
	

class KorgSinglePatch extends KorgPatch {
	constructor () {
		super();
		this.dlength = 540;
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
}

class KorgMultiPatch extends KorgPatch {
	constructor () {
		super();
		this.dlength = 448;
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
}

exports.base = KorgPatch;
exports.single = KorgSinglePatch;
exports.multi = KorgMultiPatch;
		


