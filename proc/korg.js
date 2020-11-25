"use strict";
/**
 * Class Korg
 * manages communication with a Korg Triton via Sysex Messages.
 * The clipboard reads the single edit buffer from the synth
 */
 
 // for tracing
var Combi = require('./sysex');
var Sysex = Combi.kg;

 
var KorgPatchModule = require('./korgpatch');
var Patch = KorgPatchModule.base;
var SinglePatch = KorgPatchModule.single;
var MultiPatch = KorgPatchModule.multi;
const Base64 = require('Base64');

var theInstances = [];

module.exports = class Korg {
	constructor(MIn, MOut, MChan) {
		this.mIn = MIn;
		this.mOut = MOut;
		this.mChan = MChan;
		this._clipboard = new SinglePatch();
	}
	

	get sysexData() {
		return this.DataSet.raw;
	}
	
	get clipboard() {
		return this._clipboard;
	}
	
	readCurrentPatch() {
		var curpat = new SinglePatch ();		//TODO: query mode and read either program or combi
		return new Promise((resolve,reject) => {
			curpat.readFromSynth(this.mIn, this.mOut, this.mChan).then((ign) => {
				this._clipboard = curpat;
				resolve(curpat);
			}).catch ((e) => {
				reject(e);
			});
		});
	}
	
	writeCurrentPatch() {
		return new Promise((resolve,reject) => {
			this._clipboard.writeToSynth(this.mIn, this.mOut, this.mChan).then((ign) => {
				resolve(this.clipboard);
			}).catch ((e) => {
				reject(e);
			});
		});
	}
		
	/**
	 * writePatchToData
	 * The current role is MIDI-Server and we create a sysex file for download to the client.
	 * The browser will store it there.
	 */
	writePatchToData() {
		Sysex.trace = true;
		return new Promise((resolve,reject) => {
			if (this._clipboard == undefined) reject(new Error("Clipboard empty"));
			try {
				var DatArr = Patch.writePatchToBlob(this._clipboard);
				resolve(DatArr);
			} catch (e) {
				reject(e);
			}
		});
	}
	
	readMemoryFromSynth(postdat) {
		var BankTypeObject;
		if (postdat.type == 'S') {
			if (postdat.Bank == 0) this.SynthPatches = [];
			BankTypeObject = new SinglePatch();
		} else {
			BankTypeObject = new MultiPatch();
		}			
		return new Promise((resolve,reject) => {
			BankTypeObject.readMemoryBankFromSynth(this.mIn, this.mOut, this.mChan, postdat).then((res) => {
				let Names = [];
				this.SynthPatches.push(res);
				res.pat.forEach((bk) => {
						Names.push(bk.patchname);
				});
				resolve(Names);
			}).catch ((err) => {
				reject(err);
			});
		});
	}

	writeMemoryToSynth(postdat) {
		var TypedPatch;
		if (this.SynthPatches == undefined) {
			return Promis.reject("No patches loaded");
		}
		if (postdat.bnk[0] == 'S') {
			TypedPatch = new SinglePatch();
		} else {
			TypedPatch = new MultiPatch();
		}
		return TypedPatch.writeMemoryToSynth(this.SynthPatches, this.mIn, this.mOut, this.mChan, postdat);
	}
	
	readMemoryFromDataURL(postdat) {
		return new Promise((resolve,reject) => {
			var start = postdat.indexOf('base64,');
			if (start == -1) reject("base64 error");
			try {
				var Names = [];
				// why doen't this work?
				// var Dat = Uint8Array.from(Base64.atob(postdat.slice(start+7)));
				var Dat = Base64.atob(postdat.slice(start+7));
				var DatArr = new Array(Dat.length);
				for (var i=0; i< Dat.length; i++)
					DatArr[i] = Dat.charCodeAt(i);
				this.FilePatches = Patch.readMemoryFromBlob(DatArr);
				this.FilePatches.forEach((bank) => {
					let bk = [];
					bank.pat.forEach((pt) => {
						bk.push(pt.patchname);
					});
					Names.push({pat:bk, type:bank.btp});
				});
				resolve(Names);
			} catch (e) {
				reject(e);
			}
		});
	}
	
	/**
	 * writeMemoryToData
	 * The current role is MIDI-Server and we create a sysex file for download to the client.
	 * The browser will store it there.
	 */
	writeMemoryToData() {
		return new Promise((resolve,reject) => {
			if (this.FilePatches == undefined) reject(new Error("No patches loaded"));
			try {
				var DatArr = Patch.writeMemoryToBlob(this.FilePatches);
				resolve(DatArr);
			} catch (e) {
				reject(e);
			}
		});
	}
	
	/**
	 * swap
	 * swaps the SynthPatches with the FilePatches completely.
	 */
	swap() {
		var tmp = this.FilePatches;
		this.FilePatches = this.SynthPatches;
		this.SynthPatches = tmp;
	}
	
	/**
	 * _isCompatible(value, bank)
	 * checks, if the patch value is compatible with the bank (single / multi)
	 * and returns an error message, if not
	 */
	_isCompatible(value, btp) {
		if (value instanceof SinglePatch) {
			if (btp != 'S')
				return "Cannot move single patch to combi bank";
		} else {
			if (btp != 'M')
				return "Cannot move combi patch to single bank";
		}
		return "Ok";
	}
	
	_getOrSetVar(id, value) {
		var bank;
		var ind;
		switch (id[0]) {
			case 'c':
				if (value != undefined) this._clipboard = value;
				else return this._clipboard;
				break;
			case 's':
				bank = Patch.bankLetter2Index(id[1], id[2]);
				ind = Number(id.substr(3));
				if (value != undefined) {
					let comp = this._isCompatible(value, id[1]);
					if (comp == "Ok")
						this.SynthPatches[bank].pat[ind] = value;
					else 
						throw comp;
				} else {
					return this.SynthPatches[bank].pat[ind];
				}
				break;
			case 'f':
				bank = Patch.bankLetter2Index(id[1], id[2]);
				ind = Number(id.substr(3));
				if (value != undefined) {
					let comp = this._isCompatible(value, id[1]);
					if (comp == "Ok")
						this.FilePatches[bank].pat[ind] = value;
					else 
						throw comp;
				} else {
					return this.FilePatches[bank].pat[ind];
				}
				break;
		}
	}

	/**
	 * move a Patch in the banks
	 * from and to are server strings from th ui.
	 * The server string takes the form [sf][SM][A-N]\d{1,3} with the number in the range 0-127.
	 * A special case is the clipboard, which has only "c" as the server string.
	 */
	move(from, to) {
		if ((from[0] == 's' || to[0] == 's') && this.SynthPatches == undefined) return "SynthPatches undefined!";
		if ((from[0] == 'f' || to[0] == 'f') && this.FilePatches == undefined) return "FilePatches undefined!";
		try {
			this._getOrSetVar(to, this._getOrSetVar(from));
			return {ok:this._getOrSetVar(from).patchname};
		} catch (e) {
			return {error:e.toString()};
		}
	}
}


 