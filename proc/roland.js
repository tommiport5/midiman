/**
 * Class Roland
 * manages communication with a Roland Synthesizer via Sysex Messages.
 * It is a Multiton. Each instance can be identified by the triple [MidiIn, MidiOut, MidiChannel].
 * But the devices are managed by the top level application mm.js, so theInstances are not used at all.
 */

var Combi = require('./sysex');
var Sysex = Combi.rs;
var Patch = require('./rolandpatch');
const Base64 = require('Base64');

var theInstances = [];

module.exports = class Roland {
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
		nins = new Roland(MIn, MOut, MChan);
		console.log(`new Roland instance for ${MIn.id}, ${MOut.id}, ${MChan}`);
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
	
	/*
	getCurrentPatchName() {
		var RequestData = new Sysex();
		this.DataSet = new Sysex();

		var Ret = this.DataSet.listen(this.mIn);
		RequestData.brand = 0x41;
		RequestData.channel = this.mChan;
		RequestData.model = 0x14;
		RequestData.command = 0x11;
		RequestData.append(Patch.num2threebyte(384));		
		RequestData.append(Patch.num2threebyte(18));
		RequestData.send(mOut);
		return Ret;
	}
	*/
	
	readCurrentPatch() {
		var curpat = new Patch ();
		return new Promise((resolve,reject) => {
			curpat.readFromSynth(this.mIn, this.mOut, this.mChan).then((ign) => {
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
				if (value != undefined) this._clipboard = value;
				else return this._clipboard;
				break;
			case 's':
				ind = Number(id.substr(1));
				if (value != undefined) this.SynthPatches[ind] = value;
				else return this.SynthPatches[ind];
				break;
			case 'f':
				ind = Number(id.substr(1));
				if (value != undefined) this.FilePatches[ind] = value;
				else return this.FilePatches[ind];
				break;
		}
	}

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
	
	test(postdat) {
		if (this._clipboard == undefined) return Promise.reject(new Error("Clipboard empty"));
		if (!this._clipboard.complete) return Promise.reject(new Error("Clipboard incomplete"));
		else return this._clipboard.test(this.mIn, this.mOut, this.mChan, postdat);
	}

	
}


 