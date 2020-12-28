import 'jasmine';

import { Ensure, includes, property, isGreaterThan } from '@serenity-js/assertions';
import { Ability, actorCalled, actorInTheSpotlight, Duration, engage, Interaction,  Log, Loop, UsesAbilities} from '@serenity-js/core';
import { Navigate, Website, Target, Click, Switch, Text, Enter, Attribute, Wait, Pick } from '@serenity-js/protractor';
import {by, ElementArrayFinder, ElementFinder } from 'protractor';
import {Actors} from '../src';
import * as helpers from '../src/helpers';
import * as rest from '../src/rest';
import { CallAnApi } from '@serenity-js/rest';

export {SynthCommon};

class EntryPage {
	static SynthLinks = Target.all('Synth Link').located(by.css('.icon'));
	static QuitButton = Target.the('Quit Button').located(by.id('quitbutton'));
}

class SynthCommon {
	static Result = Target.the('message line').located(by.id('Result'));
	static InputFileName = Target.the('InputFileName').located(by.id('fname'));
	static ReadFileButton = Target.the('ReadFileButton').located(by.id('readFile'));
	static FilePatches = Target.all('FilePatches').located(by.className('fpname'));
	static TestButton = Target.the('TestButton').located(by.id('test'));
}

describe('Midi Patch Manager', () => {
	

    beforeEach(() => engage(new Actors()));

/*
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
*/
	const picked = Pick.from<ElementFinder, ElementArrayFinder>(SynthCommon.FilePatches);
	
	it('tests one synth', () =>
        actorCalled('Jasmine').whoCan(
			CallAnApi.at('http://localhost:10532'),
		)
		.attemptsTo(
            Navigate.to('http://localhost:10532/Synths/Roland D50.html'),
			Enter.theValue(helpers.getConfigString(Website.title(), 'sysex')).into(SynthCommon.InputFileName),	
			Click.on(SynthCommon.ReadFileButton),
			Wait.until(Text.of(SynthCommon.Result), includes('Successfull')),	
			//Loop.over(SynthCommon.FilePatches).to(
				rest.movePatchToClipboard(helpers.getConfigString(Website.title(), 'name'), Attribute.of(picked.get(0)).called('id')),
				//	Attribute.of(Loop.item()).called('id')),
				Click.on(SynthCommon.TestButton),
			//),
			Wait.for(Duration.ofSeconds(5)),
			Log.the(Text.of(SynthCommon.Result))
        ));

});

