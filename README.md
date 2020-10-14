#M I D I M A N

##Manager for synthesizer sounds via MIDI Sysex

Currently available for access virus b and Roland D50

Based on node.js, javascript and the webmidi package

##ABSTRACT

This package allows you manage the sound for your synthesizer via drag'n#drop from your computer (if you happen to have a supported synthesizer).
Follow the installation steps below and start the main module mm.js. 

##INSTALLATION

1. Install node.js version 12(http://nodejs.org) and the npm package manager on your computer, if you don't have it yet.
1. Install midiman with npm (see https://docs.npmjs.com/cli/install).
    Here is the shortinstruction I have been missing:
    1. Exexcute npm init in your home directory. Give a short description (default package.json), leave all other questions to default
    1. Execute npm install midiman
1. Edit the configuration file **synths.json.sample** to reflect you MIDI setup and store it as **.synth.json** (note the leading ".") in your home directory.
1. Run 'node midiman'

##USAGE
'midiman' will fire up your preferred browser shows each of your synths from the configuration file **.synths.json** as a link.
Clicking this link will open a new tab with two boxes _Synth_ and _File_.
The _Synth_ box contains the Midi settings from your configuration file. It is used to transfer the patches from and two the synthesizer.
The _File_ box contains patches from files on your computer.
You can move patches between the boxes (and the clipboard between them) with drag and drop.
You can swap the content of the boxes with the _Swap_ button between them.

##DEVELOPERS
Contributions are welcome! Clone the project from https://github.com/tommiport5/MidiMan.git and add the code for your synthesizer
