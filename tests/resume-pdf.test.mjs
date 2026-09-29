import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const code = readFileSync(new URL('../app/resume.js', import.meta.url), 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(code, context);
const R = context.HopewickResume;

function sample() {
  return {
    contact: { name: 'José Rivera', phone: '0400 000 111', email: 'jose@example.com', location: 'Logan' },
    summary: 'I am looking for steady work and I am ready to learn.',
    experience: [{
      id: 'rabc123',
      role: 'Kitchen hand',
      place: 'Community kitchen',
      dates: '2023–2024',
      details: 'Prepared meals\nHelped with the dishes',
    }],
    education: [{
      study: 'First aid course',
      place: 'Local centre',
      dates: '2024',
      details: 'Completed a short course',
    }],
    skills: 'Teamwork, being on time\nCooking',
    references: { mode: 'available', items: [] },
  };
}

test('normalize keeps known fields and drops extras', () => {
  const out = R.normalizeResume({
    contact: { name: '  Sam  ', secret: 'nope' },
    summary: 'Hello',
    extra: true,
    experience: [],
    references: { mode: 'nope', items: [{ name: 'Pat' }] },
  });
  assert.equal(out.contact.name, '  Sam  '.slice(0, 80));
  assert.equal(out.contact.secret, undefined);
  assert.equal(out.extra, undefined);
  assert.equal(out.experience.length, 1);
  assert.equal(out.references.mode, 'available');
  assert.equal(out.references.items[0].name, 'Pat');
});

test('empty draft is not downloadable content', () => {
  assert.equal(R.resumeHasContent(R.emptyResume()), false);
  assert.equal(R.resumeHasContent(sample()), true);
});

test('pdf is a valid multi-object file without a product watermark', () => {
  const pdf = R.buildPdf(sample());
  assert.match(pdf, /^%PDF-1\.4\n/);
  assert.match(pdf, /%%EOF\n$/);
  assert.doesNotMatch(pdf, /Hopewick/i);
  assert.match(pdf, /Jos\\351 Rivera/);
  assert.match(pdf, /Kitchen hand, Community kitchen/);
  assert.match(pdf, /Available on request/);
  assert.match(pdf, /Teamwork, being on time, Cooking/);

  const start = Number(pdf.split('startxref\n')[1].split('\n')[0]);
  assert.match(pdf.slice(start), /^xref\n/);
  const size = Number(pdf.match(/\/Size (\d+)/)[1]);
  const xrefLines = pdf.slice(start).split('\n');
  for (let id = 1; id < size; id++) {
    const line = xrefLines[id + 2];
    const offset = Number(line.slice(0, 10));
    assert.equal(pdf.slice(offset, offset + String(id).length + 6), id + ' 0 obj');
  }
  assert.ok((pdf.match(/\/Type \/Page /g) || []).length >= 1);
});

test('long experience flows onto another page', () => {
  const resume = sample();
  resume.experience = Array.from({ length: 8 }, (_, i) => ({
    role: 'Volunteer ' + (i + 1),
    place: 'Community house',
    dates: '202' + (i % 5),
    details: 'Helped with meals, set-up and clean-up for a weekly community lunch. '.repeat(6),
  }));
  const pdf = R.buildPdf(resume);
  const pages = (pdf.match(/\/Type \/Page /g) || []).length;
  assert.ok(pages >= 2, 'expected at least 2 pages, got ' + pages);
  assert.match(pdf, /Volunteer 1, Community house/);
  assert.match(pdf, /Volunteer 8, Community house/);
});

test('listed references omit the available-on-request line', () => {
  const resume = sample();
  resume.references = {
    mode: 'list',
    items: [{ name: 'Alex Nguyen', relationship: 'Volunteer coordinator', phone: '0412 000 000' }],
  };
  const pdf = R.buildPdf(resume);
  assert.match(pdf, /Alex Nguyen/);
  assert.match(pdf, /Volunteer coordinator/);
  assert.doesNotMatch(pdf, /Available on request/);
});

test('filename uses the name', () => {
  assert.equal(R.resumeFilename(sample()), 'jos-rivera-resume.pdf');
  assert.equal(R.resumeFilename(R.emptyResume()), 'resume.pdf');
});

test('companion gates the resume builder on Hopewick Plus', () => {
  const app = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
  const plans = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(app, /src="resume\.js"/);
  assert.match(app, /id="resumeView"/);
  assert.match(app, /data-open="resume"/);
  assert.match(app, /eden\.p\.<id>\.resume/);
  assert.match(app, /'resume'/);
  assert.match(app, /function syncResumeGate/);
  assert.match(app, /id="resumeGate"/);
  assert.match(app, /id="resumeEditorMount"/);
  assert.doesNotMatch(app, /id="resumeBuilder"/);
  assert.doesNotMatch(app, /id="resumeDownload"/);
  const editors = JSON.parse(readFileSync(new URL('../server/library/plus-editors.json', import.meta.url), 'utf8'));
  assert.match(editors.resume, /id="resumeBuilder"/);
  assert.match(editors.resume, /id="resumeDownload"/);
  assert.match(app, /The resume builder is part of Hopewick Plus/);
  assert.doesNotMatch(app, /not part of Plus/);
  assert.match(plans, /The resume builder, kept on this device/);
  assert.match(plans, /3 days free/);
  assert.match(app, /id="helpBtn"/);
  assert.match(app, /id="dvView"/);
  assert.match(app, /Word for the day/);
});
