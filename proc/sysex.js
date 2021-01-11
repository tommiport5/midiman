/**
 * Sysex
 * class for sysex handling
 * based on webmidi
 */
 
var _trace = false;
var _debug = false;

class Sysex {
	static set trace(trc) {
		_trace = trc;
	}
	// use carefully, can produce lots of output
	static set debug(dbg) {
		_debug = dbg;
	}
	constructor(Brand, Channel, Model, Command) {
		this.rawData = [];
		this._brand = Brand;
		this._channel = Channel;
		this._model = Model;
		this._command = Command;
	}
	
	get raw() {
		return this.rawData;
	}
	
	set raw(data) {
		this.rawData = data;
	}
	
	set brand(Brand) {
		this._brand = Brand;
	}
	set channel(Channel) {
		this._channel = Channel;
	}
	set model(Model) {
		this._model = Model;
	}
	
	get command() {
		return this._command;
	}
	
	set command(Cmd) {
		this._command = Cmd;
	}
	
	append(arr) {
		this.rawData = this.rawData.concat(arr);
	}
	
	_linear() {
		var Two = this._buildTelegram();
		return Two[0].concat(Two[1]);
	}
	
	listen(inp, time=10000) {
		return new Promise((resolve, reject) => {
			try {
				var tmo;
				inp.addListener("sysex", undefined, (ev) => {
					clearTimeout(tmo);
					// ev.data: "The raw MIDI message as an array of 8 bit values."
					// for coherence with send data, we must shift the first four to the resp class members.
					// A UInt8Array is not an array, so it has no shift() member :-(
					try {
						this.rawData = Array.from(ev.data);
						if (_debug) this.logDebug(this.rawData);
						else if (_trace) console.log("receiving sysex: " + this.rawData.slice(1,17).map((val) => {return "0x" + val.toString(16);})); 
						inp.removeListener("sysex");
						this._parseTelegram();
						resolve(this);
					} catch(e) {
						console.log(e);
						reject(e);
					}
				});
				tmo = setTimeout(() => {
					inp.removeListener("sysex");
					reject("timeout");
					}, time);
			} catch (e) {
				reject("Cannot add listener: " + e);
			}
		});
	}
	
	logDebug(unparsed) {
		let lin;
		if (unparsed)
			lin = unparsed;
		else
			lin = [0xf0].concat(this._linear(), [0xf7]);
		for (let i=0; i<lin.length; i+=16) {
			let line = i.toString(16);
			let lead = 6-line.length;
			if (lead > 0) line = "0".repeat(lead) + line;
			line += ": ";
			for (let j=0; j<16; j++) 
				if (i+j < lin.length) {
					let hex = lin[i+j].toString(16)
					if (hex.length < 2) hex = '0' + hex;
					line +=  hex + ' ';
				}
			console.log(line);
		}
	}

	asSendData() {
		return this._linear().map((val) => {
			return "0x" + val.toString(16);
		});
	}
	
	asBlob() {
		var net = this._linear();
		net.unshift(0xf0);
		net.push(0xf7);
		return net;
	}
	
	send(out) {
		if (_debug) this.logDebug();
		else if (_trace) console.log("sending sysex:   " + this.asSendData().slice(0,16));
		var sx = this._buildTelegram();
		out.sendSysex(sx[0], sx[1]);
	}
}

class  RolandSysex extends Sysex {
	constructor(chan, cmd) {
		super([0x41], chan, 0x14, cmd);
	}
	
	// roland specific
	_checksum() {
		return -this.rawData.reduce(function(total, val) {
			return total+val;
		});		
	}
	
	
	/**
	 * parseTelegram
	 * parses the telegram from webmidi and fills the member variables
	 */
	_parseTelegram() {
		this.rawData.shift();				// 0xf0
		this._brand = [this.rawData.shift()];	// is supposed to be an array
		this._channel = this.rawData.shift();
		this._model = this.rawData.shift();
		this._command = this.rawData.shift();
		this.rawData.pop();					// 0xf7
		if (this.rawData.length > 0 ) {
			if (this.rawData.reduce((total, cur) => {total += cur;}) && 0xff != 0) {
				inp.removeListener("sysex");
				console.log("reject checksum error");
				throw "checksum error";
				return;
			} else {
				this.rawData.pop();
			}
		}
	}
	
	/**
	 * _buildTelegram
	 * builds the telegram for webmidi from the member variables
	 and returns an array of the two parameters for output.sendSysex
	 */
	_buildTelegram() {
		if (this.rawData.length == 0) {
			return [this._brand, [this._channel, this._model, this._command]];
		}else {
			return [this._brand, [this._channel, this._model, this._command].concat(this.rawData, [this._checksum() & 0x7f])];
		}
	}
		
}

const AccessDumpCommands = [0x10, 0x11];

class AccessSysex extends Sysex {
	constructor(chan, cmd) {
		super([0, 0x20, 0x33], chan, 1, cmd);
	}
	
	_checksum() {
		var cs = this._channel + this.command;
		return this.rawData.reduce(function(total,val) {
			return total + val;
		}, cs);
	}
	
	_parseTelegram() {
		var cs;
		this.rawData.shift();				// 0xf0
		this._brand = this.rawData.splice(0, 3);
		this._model = this.rawData.shift();
		cs = this._channel = this.rawData.shift();
		cs += this._command = this.rawData.shift();
		this.rawData.pop();					// 0xf7
		if (AccessDumpCommands.includes(this._command)&& this.rawData.length >= 257) {
			let exp = this.raw.pop();
			//console.log(`${this.rawData.length} byte received raw sysex`);
			let cs = this._checksum() & 0x7f;
			if (exp != cs) {
					let msg = `Checksum mismatch, received ${exp} instead of ${cs}`;
					console.log(msg);
					throw msg;
				}
		}
	}
	
	_buildTelegram() {
		if (AccessDumpCommands.includes(this._command)) {
			//console.log(`${this.rawData.length} byte transmitted raw sysex`);
			return [this._brand, [this._model, this._channel, this._command].concat(this.rawData, [this._checksum() & 0x7f])];
		} else  {
			// request telegrams contain no checksum
			return [this._brand, [this._model, this._channel, this._command].concat(this.rawData)];
		}
	}
}

class KorgSysex extends Sysex {
	constructor(chan, cmd) {
		super([0x42], 0x30 | chan, 0x50, cmd);
	}
	
	/**
	 * makeInquiry
	 * must write strange values into properties, so that _buildTelegram builds an induiry message
	 */
	makeInquiry() {
		this._brand = [0x7e];
		this._channel = 0x7f;
		this._model = 6;
		this._command = 1;
	}
	
	_buildTelegram() {
		return [this._brand, [this._channel, this._model, this._command].concat(this.rawData)];
	}
	_parseTelegram() {
		var cs;
		this.rawData.shift();				// 0xf0
		this._brand = this.rawData.shift();
		this._channel = this.rawData.shift() & 0xf;
		this._model = this.rawData.shift();
		this._command = this.rawData.shift();
		this.rawData.pop();					// 0xf7
	}
	
}

module.exports = {rs:RolandSysex, as:AccessSysex, kg: KorgSysex};

