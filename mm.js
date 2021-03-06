"use strict";
const finalhandler = require('finalhandler');
const http         = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
global.navigator = require('web-midi-api');
if (!global.performance) global.performance = { now: require('performance-now') };
var WebMidi = new require('webmidi');

var Roland = require(__dirname + '/proc/roland.js');
var Access = require(__dirname + '/proc/access.js');
var Korg = require(__dirname + '/proc/korg.js');

const hostname = 'localhost';
//const hostname = '192.168.32.31';
const port = 10532;
const src_dir = 'file://' + __dirname + '/';

const Express = require('express');
var app = Express();
app.use(Express.json());
app.use(Express.urlencoded({extended:true}));
 
var server = http.createServer(function(req, res) {
  app(req, res, finalhandler(req, res));
});

var AllSettings;
var Triggered = false;
var MySettings = [];
var theSynthesizers = [];
const SynthClasses = {"Roland":Roland, "Access":Access, "Korg": Korg};

var bServerMode = process.argv[process.argv.length-1] == "-S" || process.argv[process.argv.length-1] == "--server-only";

function readSettings(model) {
	try {
		var settings = MySettings.find((it) =>{return it.name == model;});
		if (settings) return settings;
		var fn =  os.homedir() + path.sep + ".synths.json";
		AllSettings = JSON.parse(fs.readFileSync(fn));
		settings = AllSettings.find((it) =>{return it.name == model;});
		if (settings) {
			let mIn = WebMidi.getInputByName(settings.MidiIn);
			let mOut = WebMidi.getOutputByName(settings.MidiOut);
			let mChan = settings.MidiChan-1;
			let that = new SynthClasses[settings.class](mIn, mOut, mChan);
			let Instance = {name: settings.name, synth: that};
			theSynthesizers.push(Instance);
			MySettings.push(settings);
			return settings;
		}
		else
			return undefined;
	} catch (e) {
		console.log("Cannot read settings, " + e);
		return undefined;
	}
}

function getInstance(model) {
	readSettings(model);
	return theSynthesizers.find((it) => {return it.name == model;}).synth;
}

function handlePost(url, func) {
	app.post(url, (req, res) => {
		//console.log(`Received a post to ${req.path}`);
		var querydata = "";
		req.on('data', (data) => {
			//console.log(`Received data for ${req.path}`);
			querydata += data;
			if (querydata.length > 1e8) {
				querydata = "";
				res.writeHead(413, {'Content-Type': 'text/plain'}).end();
				req.connection.destroy();
			}
		}).on('end', () => {
			try {
				//console.log(`Received end for ${req.path}`);
				func(JSON.parse(querydata), res);
			} catch (e){
				console.log(`error handling ${req.path}: ${e}`);
			}
		}).on('error', (err) => {
			console.log(`Received error ${err} for ${req.path}`);
		});
	});
}
 
function deliver(path, res) {
	let req = new URL(path);
	if (req.pathname.endsWith("html")) {
		res.setHeader('Content-Type', 'text/html');
	} else if (req.pathname.endsWith("js")) {
		res.setHeader('Content-Type', 'text/javascript');
	}
	fs.readFile(req, function(err, data) {
		if (err) {
			console.log(req.toString() + ' not accesible');
			res.statusCode = 403;
			res.statusMessage = 'Forbidden';
			res.end('not accesible');
		} else {
			console.log('sending ' + path);
			res.end(data);
		}
	});
}

// forcing quit when window unloads:
app.get('/forcequit', function(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ok');
  console.log('forcing quit');
  WebMidi.removeListener();
  WebMidi.disable();
  server.close();
  process.exit(0);		// TODO: make sure everything is written yet
});

// TODO: quit also when closing the browser
app.get('/quit', function (req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.write('<html><head><script>document.onload = function() {window.close();};</script></head>');
  //res.write('<html><head><script>function max_zu() {window.close();};</script></head>');
  res.end('<body>Bye!</body></html>');
  if (!bServerMode) {
	  server.close();
	  WebMidi.disable();
	  console.log('server closed and WebMidi disabled');
	  process.exit(0);
  }
});

app.get('/swap',function (req,res) {
	getInstance(req.query.Mdl).swap();
	res.setHeader('Content-Type', 'text/json; charset=utf-8');
	res.end('"Ok"');
});


handlePost('/move',function (req,res) {
	//console.log(`moving ${req.from} to ${req.to}`);
	res.statusCode = 200;
	res.setHeader('Content-Type', 'text/json; charset=utf-8');
	res.end(JSON.stringify(getInstance(req.Mdl).move(req.from, req.to)));
});

handlePost('/readPatch', (postdat, res) => {
	var Msg;
	var PatchName;
	try {
		getInstance(postdat.Mdl).readCurrentPatch().then((patch) => {
				let Msg = patch.patchname;
				res.setHeader('Content-Type', 'text/json; charset=utf-8');
				res.setHeader("cache-control", "no-store");
				res.end('{"patch":"' + Msg + '"}');
			}).catch((value) =>{
				let Msg = 'Could not read patch, reason: ' + value;
				res.setHeader('Content-Type', 'text/json; charset=utf-8');
				res.setHeader("cache-control", "no-store");
				res.end('{"error":"' + Msg + '"}');
			});
	} catch(e) {
		res.setHeader('Content-Type', 'text/json; charset=utf-8');
		res.setHeader("cache-control", "no-store");
		res.end('{"error":"' + e + '"}');
	}	
});

handlePost('/writePatch', (postdat, res) => {
	var Msg;
	var PatchName;
	try {
		getInstance(postdat.Mdl).writeCurrentPatch().then((patch) => {
				let Msg = patch.patchname;
				res.setHeader('Content-Type', 'text/json; charset=utf-8');
				res.setHeader("cache-control", "no-store");
				res.end('{"patch":"' + Msg + '"}');
			}).catch((value) =>{
				let Msg = 'Could not write patch, reason: ' + value;
				res.setHeader('Content-Type', 'text/json; charset=utf-8');
				res.setHeader("cache-control", "no-store");
				res.end('{"error":"' + Msg + '"}');
			});
	} catch(e) {
		res.setHeader('Content-Type', 'text/json; charset=utf-8');
		res.setHeader("cache-control", "no-store");
		res.end('{"error":"' + e + '"}');
	}	
});

//TODO: adjust the logic
handlePost('/selIfc', (postdat, res) => {
	let mIn = WebMidi.getInputByName(postdat.MidiIn);
	let mOut = WebMidi.getOutputByName(postdat.MidiOut);
	let mChan = postdat.MidiChan-1;
	try {
		Roland.getInstance(mIn, mOut, mChan);
		res.setHeader('Content-Type', 'text/json; charset=utf-8');
		res.setHeader("cache-control", "no-store");
		res.end('{"result":"' + Msg + '"}');
	} catch(e) {	
		res.setHeader('Content-Type', 'text/json; charset=utf-8');
		res.setHeader("cache-control", "no-store");
		res.end('{"result":"' + e + '"}');
	}	
});

handlePost('/readMemory', (postdat, res) => {
	try {
		getInstance(postdat.Mdl).readMemoryFromSynth(postdat).then((answ) => {
			var result = {result:"Successfully read memory", names:answ};
			res.setHeader('Content-Type', 'text/json; charset=utf-8');
			res.setHeader("cache-control", "no-store");
			res.end(JSON.stringify(result));
		}).catch((err) =>{
			let Msg = 'Could not read memory, ' + err;
			res.setHeader('Content-Type', 'text/json; charset=utf-8');
			res.setHeader("cache-control", "no-store");
			res.end('{"result":"' + Msg + '"}');
		});
	} catch(e) {
		res.setHeader('Content-Type', 'text/json; charset=utf-8');
		res.setHeader("cache-control", "no-store");
		res.end('{"result":"' + e + '"}');
	}	
});

handlePost('/writeMemory', (postdat, res) => {
	try {
		getInstance(postdat.Mdl).writeMemoryToSynth(postdat).then((arr) => {
			var result = {result:"Memory successfully written"};
			res.setHeader('Content-Type', 'text/json; charset=utf-8');
			res.setHeader("cache-control", "no-store");
			res.end(JSON.stringify(result));
		}).catch((err) =>{
			let Msg = 'Could not write memory, ' + err;
			res.setHeader('Content-Type', 'text/json; charset=utf-8');
			res.setHeader("cache-control", "no-store");
			res.end('{"result":"' + Msg + '"}');
		});
	} catch(e) {
		res.setHeader('Content-Type', 'text/json; charset=utf-8');
		res.setHeader("cache-control", "no-store");
		res.end('{"result":"' + e + '"}');
	}	
});

handlePost('/readFile', (postdat, res) => {
	try {
		getInstance(postdat.Mdl).readMemoryFromDataURL(postdat.Cont).then((answ) => {
			var result = {result:"Successfully read file", names:answ};
			res.setHeader('Content-Type', 'text/json; charset=utf-8');
			res.setHeader("cache-control", "no-store");
			res.end(JSON.stringify(result));
		}).catch((err) =>{
			let Msg = 'Could not read file, ' + err;
			res.setHeader('Content-Type', 'text/json; charset=utf-8');
			res.setHeader("cache-control", "no-store");
			res.end('{"result":"' + Msg + '"}');
		});
	} catch(e) {
		res.setHeader('Content-Type', 'text/json; charset=utf-8');
		res.setHeader("cache-control", "no-store");
		res.end('{"result":"' + e + '"}');
	}	
});

app.get('/writeFile.syx', (req, res) => {
	getInstance(req.query.Mdl).writeMemoryToData().then((answ) => {
		//var result = {result:"Successfully wrote file", names:answ};
		res.setHeader('Content-Type', 'audio/x-midi');
		res.setHeader("cache-control", "no-store");
		res.end(answ);
	}).catch((err) =>{
		let Msg = 'Could not read file, ' + err;
		res.setHeader('Content-Type', 'text/json; charset=utf-8');
		res.setHeader("cache-control", "no-store");
		res.end('{"result":"' + Msg + '"}');
	});
});

app.get('/writePatch.syx', (req, res) => {
	getInstance(req.query.Mdl).writePatchToData().then((answ) => {
		res.setHeader('Content-Type', 'audio/x-midi');
		res.setHeader("cache-control", "no-store");
		res.end(answ);
	}).catch((err) =>{
		let Msg = 'Could not read file, ' + err;
		res.setHeader('Content-Type', 'text/json; charset=utf-8');
		res.setHeader("cache-control", "no-store");
		res.end('{"result":"' + Msg + '"}');
	});
});

handlePost('/test', (postdat, res) => {
	try {
		getInstance(postdat.Mdl).test(postdat).then((answ) => {
			var result = {result:answ};
			res.setHeader('Content-Type', 'text/json; charset=utf-8');
			res.setHeader("cache-control", "no-store");
			res.end(JSON.stringify(result));
		}).catch((err) =>{
			let Msg = 'Could not perform test, ' + err;
			res.setHeader('Content-Type', 'text/json; charset=utf-8');
			res.setHeader("cache-control", "no-store");
			res.end('{"result":"' + Msg + '"}');
		});
	} catch(e) {
		res.setHeader('Content-Type', 'text/json; charset=utf-8');
		res.setHeader("cache-control", "no-store");
		res.end('{"result":"' + e + '"}');
	}	
});

handlePost('/comparePatch', (postdat, res) => {
	getInstance(postdat.Mdl).comparePatchToFile(postdat).then((answ) => {
		var result = {result:answ};
		res.setHeader('Content-Type', 'text/plain');
		res.setHeader("cache-control", "no-store");
		res.end(JSON.stringify(result));
	}).catch((err) =>{
		let Msg = 'Could not compare file, ' + err;
		res.setHeader('Content-Type', 'text/json; charset=utf-8');
		res.setHeader("cache-control", "no-store");
		res.end('{"result":"' + Msg + '"}');
	});
});

handlePost('/compare', (postdat, res) => {
	getInstance(postdat.Mdl).compare(postdat).then((answ) => {
		var result = {result:answ};
		res.setHeader('Content-Type', 'text/plaini');
		res.setHeader("cache-control", "no-store");
		res.end(JSON.stringify(result));
	}).catch((err) =>{
		let Msg = 'Could not compare file, ' + err;
		res.setHeader('Content-Type', 'text/plain');
		res.setHeader("cache-control", "no-store");
		res.end('{"result":"' + Msg + '"}');
	});
});

handlePost('/changeProg', (postdat, res) => {
	getInstance(postdat.Mdl).changeProg(postdat).then((answ) => {
		var result = {result:answ};
		res.setHeader('Content-Type', 'text/plain');
		res.setHeader("cache-control", "no-store");
		res.end(JSON.stringify(result));
	}).catch((err) =>{
		let Msg = 'Could not changeProg, ' + err;
		res.setHeader('Content-Type', 'text/plain');
		res.setHeader("cache-control", "no-store");
		res.end('{"result":"' + Msg + '"}');
	});
});

/**
 * SynthPage.html
 * The request for this page will not only deliver the page for the Mdl type synth
 * but also add the Synth to MySettings.
 * The "Generic" Mdl wil never bne entered into synths.json, but is used to create a new entry.
 */
app.get('/SynthPage.html', (req, res) => {
  var mod = req.query.Mdl;
  var ret = readSettings(mod);
  if (ret == undefined) {
	  deliver(src_dir + "/Synths/Generic.html", res);
  } else {
	  deliver(src_dir + "/Synths/"+ ret.name + ".html", res);
  }
});


app.get('/inputs', (req, res) =>{
  var lst = [];
  var answ;
  res.setHeader('Content-Type', 'text/json; charset=utf-8');
  WebMidi.inputs.forEach((inp) => {
	  lst.push(inp.name);
  });
  var mod = req.query.Mdl;
  var ret = readSettings(mod);
  if (ret == undefined) 
	answ = {list: lst, error: `Cannot read .synths.json in ${os.homedir()}`};
  else
	answ = {list: lst, settings: ret};
  res.end(JSON.stringify(answ));
 });
 
app.get('/outputs', (req, res) =>{
  var lst = [];
  var answ;
  res.setHeader('Content-Type', 'text/json; charset=utf-8');
  WebMidi.outputs.forEach((ot) => {
	  lst.push(ot.name);
  });
  var mod = req.query.Mdl;
  var ret = readSettings(mod);
  if (ret == undefined) 
	answ = {list:lst, error: `Cannot read .synths.json in ${os.homedir()}`};
  else
	answ = {list: lst, settings: ret};
  res.end(JSON.stringify(answ));
 });
 
app.get ('/*', function(req,res) {
	if (fs.existsSync(new URL(src_dir + req.url))) {
		deliver(src_dir + req.url, res);
	} else if (fs.existsSync(new URL(src_dir + "ui" + req.url))) {
		deliver(src_dir + "ui" + req.url, res);
	} else if (fs.existsSync(new URL(src_dir + "proc" + req.url))) {
		deliver(src_dir + "process" + req.url, res);
	} else {
		console.log(req.url + ' not found');
		res.statusCode = 404;
		res.statusMessage = 'Not Found';
		res.end();
	}
});
  
WebMidi.enable(function(err) {
		if (err) {
				console.log(`webmidi enable failed with ${err}`);
				server.close();
		}else {
                    console.log("WebMidi enabled!");
                }
}, true);


if (!bServerMode) {
	if (os.type().includes("indows")) {
		const browser = spawn('cmd.exe', ['"/c start /max http://' + hostname + ':' + port + '/index.html"']);
		browser.on('exit', (code) => {
				console.log(`browser child exited with code ${code}`);
		});
	} else {
		const browser = spawn('xdg-open', ['http://' + hostname + ':' + port + '/index.html']);
		browser.on('exit', (code) => {
				console.log(`browser child exited with code ${code}`);
		});
	}
} else {
	console.log("MidiManager started in server mode");
}

server.listen(port, hostname);


console.log(`serving at http://${hostname}:${port}/`);





