import 'jasmine';

import { Ensure, includes, property, isGreaterThan, Check, equals, not } from '@serenity-js/assertions';
import { actorCalled, Duration, engage, Log, Loop, Task } from '@serenity-js/core';
import { Navigate, Website, Target, Click, Switch, Text, Enter, Attribute, Wait } from '@serenity-js/protractor';
import {by, } from 'protractor';
import {Actors} from '../src';
import * as helpers from '../src/helpers';
import * as rest from '../src/rest';
import { TargetElements, TargetNestedElements } from '@serenity-js/protractor/lib/screenplay/questions/targets';

export {SynthCommon};

class EntryPage {
	static SynthLinks = Target.all('Synth Link').located(by.css('.icon'));
	static QuitButton = Target.the('Quit Button').located(by.id('quitbutton'));
}

class SynthRoland {
	static FilePatches = Target.all('FilePatches').located(by.className('fpname'));	
}

class SynthCommon {
	
	static FileBox = Target.the('FileBox').located(by.id('file'));	
	static Result = Target.the('message line').located(by.id('Result'));
	static InputFileName = Target.the('InputFileName').located(by.id('fname'));
	static ReadFileButton = Target.the('ReadFileButton').located(by.id('readFile'));
	static FilePatches = Target.all('FilePatches').of(SynthCommon.FileBox).located(by.className('pname'));
	static FileBankButtons = Target.all('FileBankButtons').of(SynthCommon.FileBox).located(by.className('lbb'));
	static TestButton = Target.the('TestButton').located(by.id('test'));
}

var globalScope = global as any;
globalScope.jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000000;

//const picked = Pick.from<ElementFinder, ElementArrayFinder>(SynthCommon.FileBankButtons);


const readSoundFile = () =>
	Task.where(`#actor treads a file of sound patches`,
			Enter.theValue(helpers.getConfigString(Website.title(), 'sysex')).into(SynthCommon.InputFileName),	
			Click.on(SynthCommon.ReadFileButton),
			Wait.until(Text.of(SynthCommon.Result), includes('Successfull')),
);
 
const testSimplePatchTransfer = (FilePatches: TargetElements) =>
	Task.where(`#actor transfers patches and checks their integrity`,
			Loop.over(FilePatches).to(
				rest.SendMoveRequest(helpers.getConfigString(Website.title(), 'name'),
					Attribute.of(Loop.item()).called('id')),
				Click.on(SynthCommon.TestButton),
				Wait.for(Duration.ofSeconds(1)),
				Check.whether(Text.of(SynthCommon.Result), includes('changed from'))
					.andIfSo(
						Log.the(Text.of(Loop.item()), Text.of(SynthCommon.Result)),
					),
			),	
	);

const testMultiPatchTransfer = (FilePatches: TargetNestedElements) =>
	Task.where(`#actor transfers patches and checks their integrity`,
			Loop.over(SynthCommon.FileBankButtons).to(
				Click.on(Loop.item()),
				helpers.rememberTheButton(Loop.item()),
				//Log.the(Attribute.of(Loop.item()).called('id'), helpers.BankLoopItem.getInstance()),   
				Loop.over(FilePatches).to(
					rest.SendMoveRequest(helpers.getConfigString(Website.title(), 'name'),
						helpers.moveSpecFromItem(Loop.item())),
					Wait.for(Duration.ofSeconds(1)),
					Click.on(SynthCommon.TestButton),
					Wait.until(Text.of(SynthCommon.Result), not(equals(''))),
					Check.whether(Text.of(SynthCommon.Result), not(includes('compared equal')))
						.andIfSo(
							Log.the(Text.of(Loop.item()), Text.of(SynthCommon.Result)),
						),
				), 
			),
		);
 

describe('Midi Patch Manager', () => {
	

    beforeEach(() => engage(new Actors()));

	
	it(`gives us a choice of synths`, () =>
        actorCalled('Jasmine')
			.attemptsTo(
		        Navigate.to('http://localhost:10532/index.html'),
	            Ensure.that(Website.title(), includes('Midi Patch Manager')),
				Ensure.that(EntryPage.SynthLinks, property('length', isGreaterThan(0))),
				Loop.over(EntryPage.SynthLinks).to(
					Click.on(Loop.item()),
					Switch.toNewWindow(),
		            Ensure.that(helpers.isInPageDescriptions(Website.title()), isGreaterThan(-1)),
					Switch.toOriginalWindow(),
				),
				Click.on(EntryPage.QuitButton),	
				Ensure.that(Text.of(Target.the('body').located(by.css('body'))),includes('Bye')),	
			)
	);

	it('safely sends and receives Roland patches', () =>
        actorCalled('Jasmine')
		.attemptsTo(
            Navigate.to('http://localhost:10532/Synths/Roland D50.html'),
			readSoundFile(),
			testSimplePatchTransfer(SynthRoland.FilePatches),
        ));

	it('safely sends and receives access patches', () =>
        actorCalled('Jasmine')
		.attemptsTo(
            Navigate.to('http://localhost:10532/Synths/access virus b.html'),
			readSoundFile(),
 			testMultiPatchTransfer(SynthCommon.FilePatches),
       ));

});

