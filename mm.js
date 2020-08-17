const finalhandler = require('finalhandler');
const http         = require('http');
const { spawn } = require('child_process');
const fs = require('fs');

global.navigator = require('web-midi-api');
if (!global.performance) global.performance = { now: require('performance-now') };
var WebMidi = new require('webmidi');

var Roland = require('./roland.js');
var Patch = require('./rolandPatch.js');

var RolandSynth = new Roland();

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
  Webmidi.disable();
  server.close();
});

// TODO: quit also when closing the browser
app.get('/quit', function (req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.write('<html><head><script>document.onload = function() {window.close();};</script></head>');
  //res.write('<html><head><script>function max_zu() {window.close();};</script></head>');
  res.end('<body>Bye!</body></html>');
  server.close();
  Webmidi.disable();
  console.log('server closed and webmidi ended');
});

handlePost('/check', (postdat, res) => {
	var Msg;
	var PatchName;
	//var roland = new Roland(WebMidi.getInputByName(postdat.MidiIn), WebMidi.getOutputByName(postdat.MidiOut), postdat.MidiChan-1);
	mIn = WebMidi.getInputByName(postdat.MidiIn);
	mOut = WebMidi.getOutputByName(postdat.MidiOut);
	mChan = postdat.MidiChan-1;
	try {
		RolandSynth.getCurrentPatchName(mIn, mOut, mChan).then((sysx) => {
				let PatchName =  Patch.toStr(sysx.raw.slice(3));
				let Msg = 'Found D50, current patch: ' + PatchName;
				res.setHeader('Content-Type', 'text/json; charset=utf-8');
				res.setHeader("cache-control", "no-store");
				res.end('{"result":"' + Msg + '"}');
			}).catch((value) =>{
				let Msg = 'Could not find D50, reason: ' + value;
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

handlePost('/read', (postdat, res) => {
	//var patch = new Patch(WebMidi.getInputByName(postdat.MidiIn), WebMidi.getOutputByName(postdat.MidiOut), postdat.MidiChan-1);
	mIn = WebMidi.getInputByName(postdat.MidiIn);
	mOut = WebMidi.getOutputByName(postdat.MidiOut);
	mChan = postdat.MidiChan-1;
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
	mIn = WebMidi.getInputByName(postdat.MidiIn);
	mOut = WebMidi.getOutputByName(postdat.MidiOut);
	mChan = postdat.MidiChan-1;
	try {
		RolandSynth.readMemoryFromSynth(mIn, mOut, mChan).then((arr) => {
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

handlePost('/readFile', (postdat, res) => {
	try {
		RolandSynth.readMemoryFromDataURL(postdat).then((answ) => {
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


app.get('/inputs', (req, res) =>{
  var list = [];
  res.setHeader('Content-Type', 'text/json; charset=utf-8');
  WebMidi.inputs.forEach((inp) => {
	  list.push(inp.name);
  });
  res.end(JSON.stringify(list));
 });
 
app.get('/outputs', (req, res) =>{
  var list = [];
  res.setHeader('Content-Type', 'text/json; charset=utf-8');
  WebMidi.outputs.forEach((ot) => {
	  list.push(ot.name);
  });
  res.end(JSON.stringify(list));
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

/*
WebMidi.requestMidiAccess(true).then(function(access) {
	MidiAccess = access;
	console.log("requestMidiAccess successful");
})
.catch(function(code) {
	console.log('requestMidiAccess failed with code $code');
});
*/

const browser = spawn('cmd.exe', ['"/c start /max http://' + hostname + ':' + port + '/index.html"']);
server.listen(port, hostname);

browser.on('exit', (code) => {
	console.log(`browser child exited with code ${code}`);
});

console.log(`serving at http://${hostname}:${port}/`);





