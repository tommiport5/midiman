"use strict";
/**
 * Class Access
 * manages communication with a Access Synthesizer via Sysex Messages.
 * The clipboard reads the single edit buffer from the synth
 */
 
 // for tracing
 var Combi = require('./sysex');
var Sysex = Combi.as;

 
var AccessPatchModule = require('./accesspatch');
var Patch = AccessPatchModule.base;
var SinglePatch = AccessPatchModule.single;
var MultiPatch = AccessPatchModule.multi;
const Base64 = require('Base64');

var theInstances = [];

// copy from accessui.js
const ButtonLabels = "ABCDEFGHM";

module.exports = class Access {
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
		var curpat = new SinglePatch (this.mIn, this.mOut, this.mChan);
		return new Promise((resolve,reject) => {
			curpat.readFromSynth().then((ign) => {
				this._clipboard = curpat;
				resolve(curpat);
			}).catch ((e) => {
				reject(e);
			});
		});
	}
	
	writeCurrentPatch() {
		return new Promise((resolve,reject) => {
			this._clipboard.writeToSynth(this.mOut, this.mChan).then((ign) => {
				resolve(this.clipboard);
			}).catch ((e) => {
				reject(e);
			});
		});
	}
	
	readMemoryFromSynth(postdat) {
		if (postdat.Bank == 0) this.SynthPatches = [];
		return new Promise((resolve,reject) => {
			Patch.readMemoryBankFromSynth(this.mIn, this.mOut, this.mChan, postdat.Bank).then((pat) => {
				let Names = [];
				this.SynthPatches.push(pat);
				pat.forEach((bk) => {
						Names.push(bk.patchname);
				});
				resolve(Names);
			}).catch ((err) => {
				reject(err);
			});
		});
	}

	writeMemoryToSynth() {
		return new Promise((resolve, reject) => {
			if (this.SynthPatches == undefined) {
				reject("No patches loaded");
			} else {
				try {
					Patch.writeMemoryToSynth(this.SynthPatches, this.mOut, this.mChan);
					resolve("Ok");
				} catch (e) {
					reject(e);
				}
			}
		});
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
					bank.forEach((pt) => {
						bk.push(pt.patchname);
					});
					Names.push(bk);
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
	_isCompatible(value, bank) {
		if (value instanceof SinglePatch) {
			if (bank >= 8)
				return "Cannot move single patch to multi bank";
		} else {
			if (bank < 8)
				return "Cannot move multi patch to single bank";
		}
		return "Ok";
	}
	
	_getOrSetVar(id, value) {
		var bank;
		var ind;
		switch (id[0]) {
			case 'c':
				if (value != undefined) this._clipboard = value;
				return this._clipboard;
				break;
			case 's':
				bank = ButtonLabels.indexOf(id[1]);
				ind = Number(id.substr(2));
				if (value != undefined) {
					let comp = this._isCompatible(value, bank);
					if (comp == "Ok")
						this.SynthPatches[bank][ind] = value;
					else 
						throw comp;
				} else {
					return this.SynthPatches[bank][ind];
				}
				break;
			case 'f':
				bank = ButtonLabels.indexOf(id[1]);
				ind = Number(id.substr(2));
				if (value != undefined) {
					let comp = this._isCompatible(value, bank);
					if (comp == "Ok")
						this.FilePatches[bank][ind] = value;
					else 
						throw comp;
				} else {
					return this.FilePatches[bank][ind];
				}
				break;
		}
	}

	move(from, to) {
		if ((from[0] == 's' || to[0] == 's') && this.SynthPatches == undefined) return "SynthPatches undefined!";
		if ((from[0] == 'f' || to[0] == 'f') && this.FilePatches == undefined) return "FilePatches undefined!";
		try {
		this._getOrSetVar(to, this._getOrSetVar(from));
			return "Ok";
		} catch (e) {
			return e.toString();
		}
	}
}


 