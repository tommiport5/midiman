"use strict"

const port = 10532;

var SynthPatches;
var FilePatches;

function forcequit() {
  var xhttp = new XMLHttpRequest();
  xhttp.open("GET", '/forcequit', true);
  xhttp.send();  
  //ignore the answer
};


function getJsonData(url, func)
{
	var jsonResponse, error, detail;
	var xhttp = new XMLHttpRequest();
	xhttp.onreadystatechange = function() {
		if (this.readyState == 4) {
			if  (this.status == 200) {
				try {
					jsonResponse = JSON.parse(this.responseText)
					func(jsonResponse);
					return;
				} catch(e) {
					error = "JSON parse error";
					detail = e.name;
				}
			} else {
				error = "HTML error";
				detail = this.status;
				
			}
			alert("Did not receive json data from " + url + ", error: " + error + ", detail:" + detail);
		}  // ignore other ready states
	};
	xhttp.open("GET", url, true);
	xhttp.send();	
}

function getJsonParam(url, param, func)
{
	var jsonResponse, error, detail;
	var xhttp = new XMLHttpRequest();
	xhttp.onreadystatechange = function() {
		if (this.readyState == 4) {
			if  (this.status == 200) {
				try {
					jsonResponse = JSON.parse(this.responseText)
					func(jsonResponse);
					return;
				} catch(e) {
					error = "JSON parse error";
					detail = e.name;
					alert("Did not receive json data from " + url + ", error: " + error + ", detail:" + detail);
				}
			} else {
				error = "HTML error";
				detail = this.status;
				
			}
		}  // ignore other ready states
	};
	xhttp.open("POST", url, true);
	xhttp.setRequestHeader('Content-Type', 'text/json; charset=utf-8');
	xhttp.send(param);	
}

function quit() {
	window.open( '/quit','_self');
}

function selectInterface() {
	var Settings = {MidiIn:document.getElementById("MidiIn").value,
					MidiOut:document.getElementById("MidiOut").value,
					MidiChan:document.getElementById("MidiChan").value,
					Mdl:Model};
	getJsonParam('/selIfc', JSON.stringify(Settings), (data) => {
		if (data.error)
			document.getElementById("Result").innerText = data.error;
		else
			document.getElementById("c").innerText = data.patch;
	});
}

function readCurrentPatch() {
	let Settings = {Mdl: Model};
	getJsonParam('/readPatch', JSON.stringify(Settings), (data) => {
		if (data.error)
			document.getElementById("Result").innerText = data.error;
		else
			document.getElementById("c").innerText = data.patch;
	});
}

	
function readMemory() {
	let Settings = {Mdl: Model};
	document.getElementById("Result").innerText = 'On the D50 press "Data Transfer/B.Dump/Enter" and wait while the D50 displays "Sending"';
	getJsonParam('/readMemory', JSON.stringify(Settings), (data) => {
		document.getElementById("Result").innerText = data.result;
		if (data.names) {
			displayNames("spname", data.names);
			SynthPatches = data.names;
		}
	});
}

function writeMemory() {
	let Settings = {Mdl: Model};
	document.getElementById("Result").innerText = 'On the D50 press "Data Transfer/B.Load/Enter" and wait while the D50 displays "Loading"';
	getJsonParam('/writeMemory', JSON.stringify(Settings), (data) => {
		document.getElementById("Result").innerText = data.result;
	});
}

function readFile() {
	var fl = new FormData(document.getElementById("readForm")).get("fname");
	var rd = new FileReader();
	rd.onloadend = function() {
		let Settings = {Mdl: Model, Cont:rd.result};
		getJsonParam( '/readFile', JSON.stringify(Settings), (data) => {
			document.getElementById("Result").innerText = data.result;
			if (data.names) {
				displayNames("fpname", data.names);
				FilePatches = data.names;
			}
		});
	};
	rd.readAsDataURL(fl);
}

function swap() {
	let tmp = SynthPatches;
	SynthPatches = FilePatches;
	FilePatches = tmp;
	getJsonData('/swap?Mdl=' + Model, function() {
		displayNames("spname", SynthPatches);	
		displayNames("fpname", FilePatches);
	});
}

function threebyte2num(arr) {
	return 0x80*(0x80*arr[0] + arr[1]) + arr[2];
}

function _to3Byte(num) {
	var res = [0,0,0];
	var n = Math.round(num);
	res[2] = num % 0x80;
	res[1] = Math.trunc(n/0x80 % 0x80);
	res[0] = Math.trunc(n/(0x80*0x80) % 0x80);
	return res;
}

function patch2Mem(bank, pn) {
	return threebyte2num([2,0,0]) + (bank*8+pn)*448;
}

function allowDrop(ev) {
	ev.preventDefault();
}

function dragStart(ev) {
	ev.dataTransfer.setData("text", ev.target.innerText);
	ev.dataTransfer.setData("id", ev.target.id);
}

function drop(ev) {
	ev.preventDefault();
	let src_id = ev.dataTransfer.getData("id");
	let src_txt = ev.dataTransfer.getData("text");
	let dest_id = ev.target.id;
	let dest_txt = ev.target.text;
	if (dest_id[0] == 's' ) SynthPatches[dest_id.substr(1)] = src_txt;
	if (dest_id[0] == 'f' ) FilePatches[dest_id.substr(1)] = src_txt;
	let Settings = {
		from: src_id,
		to: dest_id,
		Mdl: Model
	};
	getJsonParam('/move', JSON.stringify(Settings), (answ) => {
		if (answ.ok) {
			document.getElementById(dest_id).innerText = answ.ok;
			if (dest_id[0] == 'S' ) SynthPatches.set_pat(Number(dest_id.substr(2)), src_txt);
			if (dest_id[0] == 'F' ) FilePatches.set_pat(Number(dest_id.substr(2)), src_txt);
		} else {
			document.getElementById("Result").innerText = answ.error;
		}
	});
}

function prepareDnd() {
	var i;
	var arr = document.getElementsByClassName("spname");
	for (i=0; i < arr.length; i++) {
		arr[i].setAttribute("draggable", true);
		arr[i].id = "s" + i;
		arr[i].setAttribute("ondragstart","dragStart(event)");
	}
	arr = document.getElementsByClassName("fpname");
	for (i=0; i < arr.length; i++) {
		arr[i].setAttribute("draggable", true);
		arr[i].id = "f" + i;
		arr[i].setAttribute("ondragstart","dragStart(event)");
	}
	
}

function displayNames(tab, src) {
	var arr = document.getElementsByClassName(tab);
	var i = 0;
	if (src) {
		src.forEach((dt) => {
			arr[i++].innerText = dt;
		});
	} 
	for (;i<arr.length;) {
		arr[i++].innerText = "";
	}
}

function test() {
	let Settings = {Mdl: Model};
	document.getElementById("Result").innerText = "";
	getJsonParam('/test', JSON.stringify(Settings), (data) => {
		document.getElementById("Result").innerText = data.result;
	});
}

	
function displayForm() {
	var Settings;
	var sel1 = document.getElementById("MidiOut");
	getJsonData('/outputs?Mdl=' + Model, (answ) => {
		answ.list.forEach((nam) => {
			var opt = document.createElement("OPTION");
			opt.text = nam;
			sel1.add(opt);
		});
		Settings = answ.settings;
		if (Settings)
			sel1.value = Settings.MidiOut;
		else
			document.getElementById("Result").innerText = answ.error;			
	});
	var sel2 = document.getElementById("MidiIn");
	getJsonData('/inputs?Mdl=' + Model, (answ) => {
		answ.list.forEach((nam) => {
			var opt = document.createElement("OPTION");
			opt.text = nam;
			sel2.add(opt);
		});
		if (Settings) {
			sel2.value = Settings.MidiIn;
			document.getElementById("MidiChan").value = Settings.MidiChan;
			document.title = Settings.name;
		} else {
			document.getElementById("Result").innerText = answ.error;			
		}
	});
	document.getElementById("readPatch").addEventListener('click',readCurrentPatch);
	//document.getElementById("selInterface").addEventListener('click',selectInterface);
	document.getElementById("readMem").addEventListener('click',readMemory);
	document.getElementById("writeMem").addEventListener('click',writeMemory);
	document.getElementById("readFile").addEventListener('click',readFile);
	//document.getElementById("writeFile").href = "http://localhost:10532/writeFile.syx?Mdl=" + Model;
	document.getElementById("swapbutton").addEventListener('click',swap);
	document.getElementById("test").addEventListener('click',test);
	prepareDnd();
}

window.addEventListener("load", displayForm);