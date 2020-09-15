const finalhandler = require('finalhandler');
const http         = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
global.navigator = require('web-midi-api');
if (!global.performance) global.performance = { now: require('performance-now') };
var WebMidi = new require('webmidi');

var Roland = require('./roland.js');
var Access = require('./access.js');
var Patch = require('./rolandPatch.js');

const hostname = 'localhost';
const port = 10532;
const src_dir = 'file:///C:/Users/Dad/Documents/MidiMan';

const Express       = require('express');
var app = Express();
app.use(Express.json());
app.use(Express.urlencoded({extended:true}));
 
var server = http.createServer(function(req, res) {
  app(req, res, finalhandler(req, res));
});

var Triggered = false;
var MySettings = [];
var theSynthesizers = [];
const SynthClasses = {"Roland":Roland, "Access":Access};

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
	return theSynthesizers.find((it) => {return it.name == model;}).synth;
}

function handlePost(url, func) {
	app.post(url, (req, res) => {
		var querydata = "";
		req.on('data', (data) => {
			//console.log("data: " + data);
			querydata += data;
			if (querydata.length > 1e6) {
				querydata = "";
				res.writeHead(413, {'Content-Type': 'text/plain'}).end();
				req.connection.destroy();
			}
		});
		req.on('end', () => {
			var answer;
			try {
				func(JSON.parse(querydata), res);
			} catch (e){
				console.log('error - Cannot read post data: ' + e);
			}
		});
	});
}
 
function deliver(path, res) {
	req = new URL(path);
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
  server.close();
  WebMidi.disable();
  console.log('server closed and WebMidi disabled');
  process.exit(0);
});

app.get('/swap',function (req,res) {
	getInstance(req.query.Mdl).swap();
	res.setHeader('Content-Type', 'text/json; charset=utf-8');
	res.end('"Ok"');
});


handlePost('/move',function (req,res) {
	res.setHeader('Content-Type', 'text/json; charset=utf-8');
	res.end(JSON.stringify({result:getInstance(req.Mdl).move(req.from, req.to)}));
});

handlePost('/check', (postdat, res) => {
	var Msg;
	var PatchName;
	try {
		getInstance(postdat.Mdl).getCurrentPatch().then((patch) => {
				let Msg = patch.patchname;
				res.setHeader('Content-Type', 'text/json; charset=utf-8');
				res.setHeader("cache-control", "no-store");
				res.end('{"patch":"' + Msg + '"}');
			}).catch((value) =>{
				let Msg = 'Could not find device, reason: ' + value;
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

//TODO: if this is still necessary, route thru the synth		
handlePost('/read', (postdat, res) => {
	let mIn = WebMidi.getInputByName(postdat.MidiIn);
	let mOut = WebMidi.getOutputByName(postdat.MidiOut);
	let mChan = postdat.MidiChan-1;
	var patch = new Patch(mIn, mOut, mChan);
	try {	
		patch.readFromSynth(parseInt(postdat.bank-1), parseInt(postdat.pnum-1)).then((_ign) =>{
			let ToneNames =  patch.tonenames;
			let Msg = 'Found D50, requested tonenames: ' + ToneNames[0] + ", " + ToneNames[1];
			res.setHeader('Content-Type', 'text/json; charset=utf-8');
			res.setHeader("cache-control", "no-store");
			res.end('{"result":"' + Msg + '"}');
		}).catch((err) =>{
			let Msg = 'Could not read patch, ' + err;
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

handlePost('/readMemory', (postdat, res) => {
	try {
		getInstance(postdat.Mdl).readMemoryFromSynth(postdat).then((arr) => {
			var result = {result:"Successfully read memory", names:arr};
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
		getInstance(postdat.Mdl).writeMemoryToSynth().then((arr) => {
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

/**
 * SynthPage.html
 * The request for this page will not only deliver the page for the mdl type synth
 * but also add the Synth to MySettings.
 * The "Generic" mdl wil never bne entered into synths.json, but is used to create a new entry.
 */
app.get('/SynthPage.html', (req, res) => {
  var mod = req.query.mdl;
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
  var mod = req.query.mdl;
  var ret = readSettings(mod);
  if (ret == undefined) 
	answ = {list: lst, error: `Cannot read synths.json in ${os.homedir()}`};
  else
	answ = {list: lst, settings: ret};
  res.end(JSON.stringify(answ));
 });
 
app.get('/outputs', (req, res) =>{
  var lst = [];
  res.setHeader('Content-Type', 'text/json; charset=utf-8');
  WebMidi.outputs.forEach((ot) => {
	  lst.push(ot.name);
  });
  var mod = req.query.mdl;
  var ret = readSettings(mod);
  if (ret == undefined) 
	answ = {list:lst, error: `Cannot read synths.json in ${os.homedir()}`};
  else
	answ = {list: lst, settings: ret};
  res.end(JSON.stringify(answ));
 });
 
app.get ('/*', function(req,res) {
	if (fs.existsSync(new URL(src_dir + req.url))) {
		deliver(src_dir + req.url, res);
	} else {
		console.log(req.url + ' not found');
		res.statusCode = 404;
		res.statusMessage = 'Not Found';
		res.end();
	}
  });
  
WebMidi.enable((err) =>{
	if (err) {
		console.log("webmidi enable failed with $err");
	 	server.close();
	}
}, true);


const browser = spawn('cmd.exe', ['"/c start /max http://' + hostname + ':' + port + '/index.html"']);
server.listen(port, hostname);

browser.on('exit', (code) => {
	console.log(`browser child exited with code ${code}`);
});

console.log(`serving at http://${hostname}:${port}/`);





