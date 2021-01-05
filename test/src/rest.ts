
import { Ensure, equals, } from '@serenity-js/assertions';
import { actorCalled, Interaction, Log, Question, } from '@serenity-js/core';
import { CallAnApi, LastResponse, PostRequest, Send } from '@serenity-js/rest';


export const Apidokles = actorCalled('Apidokles').whoCan(CallAnApi.at('http://localhost:10532'));

function makePostRequest(model:Promise<string>, patchid: Promise<string>) : Promise<any> {
	return new Promise((resolve) => {
		Promise.all([model, patchid]).then((values) => {
				let payload = JSON.stringify({
						Mdl: values[0],
						from: values[1],
						to: 'c'
					});
				//console.log(payload);
				resolve(PostRequest.to('/move').using({
						headers: {
							'Content-Type' : 'text/json; charset=UTF-8',
							'Content-Length' : `${payload.length}`,
							},
						data: `${payload}`
					}));
		});
	});
}

export const SendMoveRequest = (model: Question<Promise<string>>, patchid:Question<Promise<string>>) =>
	Interaction.where('#actor sends the move request', actor => {
		let mdl = model.answeredBy(actor);
		let pid = patchid.answeredBy(actor);
		let ppr = makePostRequest(mdl, pid);
		ppr.then((pr) => {
			//console.log(pr);
			Apidokles.attemptsTo(
				Send.a(pr),
				Ensure.that(LastResponse.status(), equals(200)),
			);
		});

	});

