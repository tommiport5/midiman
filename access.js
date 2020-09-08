/**
 * Class Access
 * manages communication with a Access Synthesizer via Sysex Messages.
 * It is a Multiton. Each instance can be identified by the triple [MidiIn, MidiOut, MidiChannel].
 * TODO: Identify the "current instance" somehow.
 */
 
var Patch = require('./accesspatch');
const Base64 = require('Base64');

var theInstances = [];

module.exports = class Access {
	constructor(MIn, MOut, MChan) {
		this.mIn = MIn;
		this.mOut = MOut;
		this.mChan = MChan;
		this._clipboard = new Patch();
	}
	
	isThis(MIn, MOut, MChan) {
		return this.mIn.id == MIn.id && 
			   this.mOut.id == MOut.id && 
			   this.mChan == MChan;
	}
	
	static getInstance(MIn, MOut, MChan) {
		var nins;
		theInstances.forEach((ins) => {
			if (ins.isThis(MIn, MOut, MChan)) 
				nins = ins;
		});
		if (nins) return nins;
		nins = new Access(MIn, MOut, MChan);
		console.log(`new Access instance for ${MIn.id}, ${MOut.id}, ${MChan}`);
		theInstances.unshift(nins);	// always return the last with getSingle()
		return nins;
	}
	
	static getSingle() {
		return theInstances[0];
	}
	
	get sysexData() {
		return this.DataSet.raw;
	}
	
	get clipboard() {
		return this._clipboard;
	}
	
	getCurrentPatch() {
		var curpat = new Patch (this.mIn, this.mOut, this.mChan);
		return new Promise((resolve,reject) => {
			curpat.readFromSynth().then((ign) => {
				this._clipboard = curpat;
				resolve(curpat);
			}).catch ((e) => {
				reject(e);
			});
		});
	}
	
	readMemoryFromSynth() {
		return new Promise((resolve,reject) => {
			Patch.waitForWSD(this.mIn).then((sx) => {
				// console.log(`received 0x${sx.command.toString(16)}`);
				Patch.readMemoryFromSynth(this.mIn, this.mOut, this.mChan).then((pat) => {
					var Names = [];
					this.SynthPatches = pat;
					pat.forEach((pt) => {
						Names.push(pt.patchname);
					});
					resolve(Names);
				}).catch((err) => {
					reject(err);
				});
			}).catch ((err) => {
				reject(err);
			});
		});
	}

	writeMemoryToSynth() {
		// Sysex.trace = true;
		return new Promise((resolve, reject) => {
			if (this.SynthPatches == undefined) return reject(new Error("No patches loaded"));
			Patch.waitForRQD(this.mIn).then((sx) => {
				let Ret = Patch.waitForACK(this.mIn);
				Patch.anounceAllPatches(this.mOut, this.mChan);
				return Ret;
			}).then((sx) => {
				return Patch.writeMemoryToSynth(this.SynthPatches, this.mIn, this.mOut, this.mChan);
			}).then(() => {
				resolve("Ok");
			}).catch ((e) => {
				reject(new Error(e));
			});
			// must return a Promise here, or the caller will break on 'then'
			// this is, what the return statement above does.
			// the last then or the catch resolve or reject the returned promise
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
				this.FilePatches.forEach((pt) => {
					Names.push(pt.patchname);
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
	 * writeMemoryToData
	 * The current role is MIDI-Server and we create a sysex file for download to the client.
	 * The browser will store it there.
	 */
	writePatchToData() {
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
	
	swap() {
		var tmp = this.FilePatches;
		this.FilePatches = this.SynthPatches;
		this.SynthPatches = tmp;
	}
	
	_getOrSetVar(id, value) {
		var ind;
		switch (id[0]) {
			case 'c':
				if (value !== undefined) this._clipboard = value;
				return this._clipboard;
				break;
			case 's':
				ind = Number(id.substr(1));
				if (value !== undefined) this.SynthPatches[ind] = value;
				else return this.SynthPatches[ind];
				break;
			case 'f':
				ind = Number(id.substr(1));
				if (value !== undefined) this.FilePatches[ind] = value;
				else return this.FilePatches[ind];
				break;
		}
	}

	move(from, to) {
		if ((from[0] == 's' || to[0] == 's') && this.SynthPatches == undefined) return "SynthPatches undefined!";
		if ((from[0] == 'f' || to[0] == 'f') && this.FilePatches == undefined) return "FilePatches undefined!";
		this._getOrSetVar(to, this._getOrSetVar(from));
		return "Ok";
	}
}


 