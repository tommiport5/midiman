# M I D I M A N

Manager for synthesizer sounds via MIDI Sysex

Currently available for access virus b and Roland D50

Based on javascript, node.js and webmidi.js

## ABSTRACT

This package allows you manage the sound for your synthesizer via drag'n'drop from your computer (if you happen to have a supported synthesizer).
Follow the installation steps below and start the main module mm.js. 

## INSTALLATION

1. Install node.js version 12 (http://nodejs.org) on your computer, if you don't have it yet.
1. Install midiman with npm (see https://docs.npmjs.com/cli/install).
    Here is the short instruction I have been missing:
    1. Exexcute npm init in your home directory. Give a short description (default package.json), leave all other questions to default
    1. Execute npm install midiman
1. Edit the configuration file **synths.json.sample** to reflect you MIDI setup and store it as **.synth.json** (note the leading ".") in your home directory.
1. Run **node midiman**

## USAGE

**node midiman** will fire up your preferred browser. It shows each of your synths from the configuration file **.synths.json** as a link.
Clicking this link will open a new tab with two boxes _Synth_ and _File_.
The _Synth_ box contains the Midi settings from your configuration file. It is used to transfer the patches from and two the synthesizer.
The _File_ box contains patches from files on your computer.
You can move patches between the boxes (and the clipboard between them) with drag and drop.
You can swap the content of the boxes with the _Swap_ button between them.

## TEST

There is a complete test suite with serenity.js in the 'test' directory. If you are familiar with serenity.js, you are welcome to perform the test
in your environment. Let me know about the results and possible improvements. If you are new to serenity and want to use the test, let me know. I will
share my experiences that resulted in the current tests.

## DEVELOPERS

Contributions are welcome! Open a pull request from https://github.com/tommiport5/midiman.git and add the code for your synthesizer.

## HISTORY
1. 0.8.0 Basic functionality
1. 0.8.1 Improvements for  access virus: Add the multipatches, display the overlapping patches 6x.
1. 0.8.2 Added Korg Triton Extreme and automated tests with serenity.js

## CAVEATS

There is a bug in the MIDI implementation of the Korg Triton Extreme. For whatever reason,it modifies the routing of the valve effect from "3/4 BUS" to "Final".
But when the insert effect routing  sends the output of the last effect in the chain to 3/4, there is no sound on the output.
You can verify that with MidiOx, just echo the sysex  for the factory program A015 "Wah Wurly 2(SW1)" back to the synth. But be careful, this overwrites the sound without warning.

**midiman** implements a workaround and routes all the internal effects that are not chained to the L/R output.
