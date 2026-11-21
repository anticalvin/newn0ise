import {put,take} from './handoff.js';
import {parseDefinition,validateDefinition,MAX_DEFINITION_LENGTH,vectorId} from './vector-generator.js';

export function openVectorTab(page, definition, edit = false) {
  const definitionJSON = JSON.stringify(validateDefinition(definition));
  const ticket = vectorId();
  const tab = window.open('about:blank','_blank');
  if (!tab) throw Error('Allow pop-ups to open the vector project.');
  if (!edit) tab.opener = null;
  const url = new URL(page,location.href);
  url.searchParams.set(edit ? 'vectorEdit' : 'vectorImport',ticket);
  const ready = put(new Blob([definitionJSON],{type:'application/json'}),
    {from:edit ? 'studio-vector' : 'lab-vector'},'vector:'+ticket).then(() => {
    tab.location.replace(url.href);
  }).catch(error => {
    tab.close();
    throw error;
  });
  return {tab,ticket,ready};
}

export async function takeVector(ticket, from) {
  if (!/^[a-z0-9-]{1,80}$/i.test(ticket)) throw Error('Invalid vector handoff.');
  const record = await take('vector:'+ticket);
  if (record?.meta?.from !== from || record.blob?.type !== 'application/json' ||
    record.blob.size > MAX_DEFINITION_LENGTH) throw Error('The vector handoff is unavailable.');
  return parseDefinition(await record.blob.text());
}

export function returnVector(ticket, definition) {
  const studio = window.opener;
  if (!studio || studio.closed) throw Error('Studio is unavailable. Save the vector project to keep your edits.');
  return new Promise((resolve,reject) => {
    const receive = event => {
      if (event.origin !== location.origin || event.source !== studio ||
        event.data?.type !== 'n0ise-vector-ack' || event.data.ticket !== ticket) return;
      clearTimeout(timeout);
      removeEventListener('message',receive);
      if (event.data.error) reject(Error(event.data.error));
      else resolve();
    };
    const timeout = setTimeout(() => {
      removeEventListener('message',receive);
      reject(Error('Studio did not respond. Save the vector project to keep your edits.'));
    },4000);
    addEventListener('message',receive);
    studio.postMessage({type:'n0ise-vector-return',ticket,definition},location.origin);
  });
}
