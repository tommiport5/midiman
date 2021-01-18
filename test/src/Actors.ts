import { Actor, Cast, TakeNotes } from '@serenity-js/core';
import { BrowseTheWeb } from '@serenity-js/protractor';
import { CallAnApi } from '@serenity-js/rest';
import { protractor } from 'protractor';

export class Actors implements Cast {
    prepare(actor: Actor): Actor {
        return actor.whoCan(
            BrowseTheWeb.using(protractor.browser),
			TakeNotes.usingASharedNotepad(),
			CallAnApi.at('http://localhost:10532'),
        );
    }
}


