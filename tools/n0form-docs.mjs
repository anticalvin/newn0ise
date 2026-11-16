#!/usr/bin/env node
/* Regenerates docs/creator-kit/form-brief.txt from src/form-brief.js so the app's "Copy brief for my AI" and the docs agree. */
import {writeFileSync} from 'node:fs';
import {FORM_BRIEF} from '../src/form-brief.js';
writeFileSync('docs/creator-kit/form-brief.txt',FORM_BRIEF);console.log('wrote docs/creator-kit/form-brief.txt');
