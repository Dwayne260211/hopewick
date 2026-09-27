/* Hopewick resume builder — plain data + a dependency-free PDF.
   Loaded by app/index.html. No network, no paid libraries.
   The downloaded resume is the person's own words only — no Hopewick watermark. */
(function (root) {
  'use strict';

  const STEPS = [
    { id: 'contact', label: 'Contact' },
    { id: 'summary', label: 'Summary' },
    { id: 'experience', label: 'Experience' },
    { id: 'education', label: 'Education' },
    { id: 'skills', label: 'Skills' },
    { id: 'references', label: 'References' },
  ];

  const TIPS = {
    contact: 'A suburb or town is enough. You do not have to put a street address. Skip any detail you do not want an employer to have.',
    summary: 'Two or three plain sentences are enough. Say what you can offer. Use a starting point if you want, then change the words so they sound like you.',
    experience: 'List what you have actually done. A gap is not something to apologise for. Volunteering, casual work, courses, and caring for family or friends all count. You do not need to explain recovery, illness, or why you were not in paid work.',
    education: 'School, a short course, a ticket, a program, or training you started all count. If you did not finish, you can still say what you did or what you learned.',
    skills: 'Practical skills count: being on time, listening, teamwork, cooking, cleaning, driving, computers, using a phone, caring for people, or working outdoors.',
    references: 'This part is optional. Ask someone before you list them. A previous boss, a volunteer coordinator, a support worker, or someone you helped can be a reference. “Available on request” is honest and fine.',
  };

  const SUMMARY_PROMPTS = [
    'I am looking for steady work and I am ready to learn. I show up, I listen, and I follow through on what I say I will do.',
    'I have spent time caring for family and helping in my community. I am patient, practical, and used to getting things done.',
    'I have done casual and hands-on work, and I am building a regular routine. I want a role where I can be useful and keep learning.',
  ];

  const LIMITS = {
    name: 80, phone: 40, email: 120, location: 80,
    summary: 800, role: 80, place: 80, dates: 40, details: 600,
    skills: 600, refName: 80, relationship: 80, refPhone: 40,
    experience: 8, education: 8, references: 4,
  };

  function rid() {
    return 'r' + Math.random().toString(36).slice(2, 10);
  }

  function clip(value, max) {
    return String(value == null ? '' : value).replace(/\u0000/g, '').slice(0, max);
  }

  function keepId(value) {
    const id = String(value || '');
    return /^r[a-z0-9]+$/.test(id) ? id : rid();
  }

  function emptyRole() {
    return { id: rid(), role: '', place: '', dates: '', details: '' };
  }
  function emptyStudy() {
    return { id: rid(), study: '', place: '', dates: '', details: '' };
  }
  function emptyRef() {
    return { id: rid(), name: '', relationship: '', phone: '' };
  }

  function normalizeRole(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      id: keepId(src.id),
      role: clip(src.role, LIMITS.role),
      place: clip(src.place, LIMITS.place),
      dates: clip(src.dates, LIMITS.dates),
      details: clip(src.details, LIMITS.details),
    };
  }
  function normalizeStudy(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      id: keepId(src.id),
      study: clip(src.study, LIMITS.role),
      place: clip(src.place, LIMITS.place),
      dates: clip(src.dates, LIMITS.dates),
      details: clip(src.details, LIMITS.details),
    };
  }
  function normalizeRef(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      id: keepId(src.id),
      name: clip(src.name, LIMITS.refName),
      relationship: clip(src.relationship, LIMITS.relationship),
      phone: clip(src.phone, LIMITS.refPhone),
    };
  }

  function emptyResume() {
    return {
      contact: { name: '', phone: '', email: '', location: '' },
      summary: '',
      experience: [emptyRole()],
      education: [emptyStudy()],
      skills: '',
      references: { mode: 'available', items: [emptyRef()] },
    };
  }

  function listOrBlank(raw, limit, normalize, blank) {
    if (!Array.isArray(raw) || !raw.length) return [blank()];
    return raw.slice(0, limit).map(normalize);
  }

  function normalizeResume(raw) {
    const base = emptyResume();
    if (!raw || typeof raw !== 'object') return base;
    const contact = raw.contact && typeof raw.contact === 'object' ? raw.contact : {};
    base.contact = {
      name: clip(contact.name, LIMITS.name),
      phone: clip(contact.phone, LIMITS.phone),
      email: clip(contact.email, LIMITS.email),
      location: clip(contact.location, LIMITS.location),
    };
    base.summary = clip(raw.summary, LIMITS.summary);
    base.experience = listOrBlank(raw.experience, LIMITS.experience, normalizeRole, emptyRole);
    base.education = listOrBlank(raw.education, LIMITS.education, normalizeStudy, emptyStudy);
    base.skills = clip(raw.skills, LIMITS.skills);
    const refs = raw.references && typeof raw.references === 'object' ? raw.references : {};
    base.references = {
      mode: refs.mode === 'list' ? 'list' : 'available',
      items: listOrBlank(refs.items, LIMITS.references, normalizeRef, emptyRef),
    };
    return base;
  }

  function filled() {
    for (let i = 0; i < arguments.length; i++) {
      if (String(arguments[i] || '').trim()) return true;
    }
    return false;
  }

  function resumeHasContent(raw) {
    const r = normalizeResume(raw);
    if (filled(r.contact.name, r.contact.phone, r.contact.email, r.contact.location, r.summary, r.skills)) return true;
    if (r.experience.some(e => filled(e.role, e.place, e.dates, e.details))) return true;
    if (r.education.some(e => filled(e.study, e.place, e.dates, e.details))) return true;
    if (r.references.mode === 'list' && r.references.items.some(e => filled(e.name, e.relationship, e.phone))) return true;
    return false;
  }

  function splitLines(text) {
    return String(text || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
  }

  function joinBits(parts) {
    return parts.map(s => String(s || '').trim()).filter(Boolean).join(', ');
  }

  function resumeDocument(raw) {
    const r = normalizeResume(raw);
    const blocks = [];
    if (r.summary.trim()) blocks.push({ heading: 'Summary', paragraphs: [r.summary.trim()] });

    const experience = r.experience.filter(e => filled(e.role, e.place, e.dates, e.details));
    if (experience.length) {
      blocks.push({
        heading: 'Experience',
        entries: experience.map(e => ({
          title: joinBits([e.role, e.place]),
          dates: e.dates.trim(),
          lines: splitLines(e.details),
          bullets: true,
        })),
      });
    }

    const education = r.education.filter(e => filled(e.study, e.place, e.dates, e.details));
    if (education.length) {
      blocks.push({
        heading: 'Education and training',
        entries: education.map(e => ({
          title: joinBits([e.study, e.place]),
          dates: e.dates.trim(),
          lines: splitLines(e.details),
          bullets: true,
        })),
      });
    }

    const skills = r.skills.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
    if (skills.length) blocks.push({ heading: 'Skills', paragraphs: [skills.join(', ')] });

    if (r.references.mode === 'list') {
      const refs = r.references.items.filter(e => filled(e.name, e.relationship, e.phone));
      if (refs.length) {
        blocks.push({
          heading: 'References',
          entries: refs.map(e => ({
            title: e.name.trim(),
            dates: '',
            lines: [e.relationship, e.phone].map(s => String(s || '').trim()).filter(Boolean),
            bullets: false,
          })),
        });
      }
    } else if (blocks.length || filled(r.contact.name, r.contact.phone, r.contact.email, r.contact.location)) {
      blocks.push({ heading: 'References', paragraphs: ['Available on request.'] });
    }

    return {
      name: r.contact.name.trim(),
      contactLine: [r.contact.phone, r.contact.email, r.contact.location].map(s => s.trim()).filter(Boolean).join('  ·  '),
      blocks,
    };
  }

function resumeFilename(raw) {
  const name = normalizeResume(raw).contact.name.trim().toLowerCase();
  const slug = name.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return (slug ? slug + '-resume' : 'resume') + '.pdf';
}

  function sanitize(text) {
    return String(text || '')
      .replace(/\u0000/g, '')
      .replace(/[\u2018\u2019\u2032]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014\u2212]/g, '-')
      .replace(/\u2026/g, '...')
      .replace(/\u00A0/g, ' ')
      .replace(/\u2022/g, '•');
  }

  function encodeWinAnsi(text) {
    const mapped = sanitize(text).replace(/\u2022/g, '\u0095').replace(/•/g, '\u0095');
    const bytes = [];
    for (const ch of mapped) {
      const code = ch.codePointAt(0);
      if (code === 0x95) bytes.push(0x95);
      else if (code >= 32 && code <= 126) bytes.push(code);
      else if (code >= 160 && code <= 255) bytes.push(code);
      else bytes.push(0x3f);
    }
    return bytes;
  }

  function pdfLiteral(text) {
    const bytes = encodeWinAnsi(text);
    let out = '(';
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (b === 0x28 || b === 0x29 || b === 0x5c) out += '\\' + String.fromCharCode(b);
      else if (b < 32 || b > 126) out += '\\' + b.toString(8).padStart(3, '0');
      else out += String.fromCharCode(b);
    }
    return out + ')';
  }

  function charWidth(ch) {
    if (ch === ' ') return 278;
    if ('ilIjtfr.,;:\'!|'.includes(ch)) return 278;
    if ('mwMW@%'.includes(ch)) return 850;
    if (ch >= 'A' && ch <= 'Z') return 700;
    if ('-()[]{}'.includes(ch)) return 333;
    return 520;
  }

  function textWidth(str, size) {
    let units = 0;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) units += charWidth(s[i]);
    return units * size / 1000;
  }

  function wrap(text, size, maxWidth) {
    const clean = sanitize(text).replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    const words = clean.split(' ');
    const lines = [];
    let line = '';
    function pushLong(word) {
      let chunk = '';
      for (const ch of word) {
        const next = chunk + ch;
        if (chunk && textWidth(next, size) > maxWidth) {
          lines.push(chunk);
          chunk = ch;
        } else chunk = next;
      }
      return chunk;
    }
    for (const word of words) {
      const trial = line ? line + ' ' + word : word;
      if (textWidth(trial, size) <= maxWidth) line = trial;
      else {
        if (line) lines.push(line);
        line = textWidth(word, size) > maxWidth ? pushLong(word) : word;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function layoutPdf(doc) {
    const PAGE_W = 595.28;
    const PAGE_H = 841.89;
    const LEFT = 50;
    const RIGHT = 545;
    const TOP = 792;
    const BOTTOM = 52;
    const MAX_W = RIGHT - LEFT;
    const pages = [];
    let cmds = [];
    let y = TOP;

    function need(h) {
      if (y - h < BOTTOM && cmds.length) {
        pages.push(cmds);
        cmds = [];
        y = TOP;
      }
    }
    function draw(str, size, font, color, x, gapAfter) {
      if (!str) return;
      const leading = Math.round(size * 1.38 * 10) / 10;
      need(leading + (gapAfter || 0));
      const baseline = (y - size).toFixed(2);
      cmds.push(color + ' BT /' + font + ' ' + size + ' Tf 1 0 0 1 ' + x.toFixed(2) + ' ' + baseline + ' Tm ' + pdfLiteral(str) + ' Tj ET');
      y -= leading + (gapAfter || 0);
    }
    function rule() {
      need(10);
      const yy = (y - 3).toFixed(2);
      cmds.push('0.17 0.43 0.27 RG 0.7 w ' + LEFT.toFixed(2) + ' ' + yy + ' m ' + RIGHT.toFixed(2) + ' ' + yy + ' l S');
      y -= 10;
    }
    function paragraph(text, size, font, color, x, width, bullet) {
      const prefixWidth = bullet ? textWidth('• ', size) : 0;
      const lines = wrap(text, size, Math.max(40, width - prefixWidth));
      lines.forEach((line, i) => {
        const prefix = bullet ? (i === 0 ? '• ' : '  ') : '';
        draw(prefix + line, size, font, color, x, 0);
      });
    }

    if (doc.name) {
      wrap(doc.name, 18, MAX_W).forEach(line => draw(line, 18, 'F2', '0 0 0 rg', LEFT, 1));
    }
    if (doc.contactLine) {
      wrap(doc.contactLine, 10, MAX_W).forEach(line => draw(line, 10, 'F1', '0.30 0.40 0.35 rg', LEFT, 0));
    }
    if (doc.name || doc.contactLine) rule();

    doc.blocks.forEach(block => {
      need(40);
      draw(String(block.heading || '').toUpperCase(), 11, 'F2', '0.17 0.43 0.27 rg', LEFT, 2);
      const hy = (y + 1).toFixed(2);
      cmds.push('0.75 0.84 0.77 RG 0.6 w ' + LEFT.toFixed(2) + ' ' + hy + ' m ' + RIGHT.toFixed(2) + ' ' + hy + ' l S');
      y -= 6;
      (block.paragraphs || []).forEach(p => {
        paragraph(p, 11, 'F1', '0 0 0 rg', LEFT, MAX_W, false);
        y -= 4;
      });
      (block.entries || []).forEach(entry => {
        need(32);
        const title = entry.title || '';
        const dates = entry.dates || '';
        if (title && dates && textWidth(title + '   ' + dates, 11) <= MAX_W) {
          const leading = Math.round(11 * 1.38 * 10) / 10;
          need(leading);
          const baseline = (y - 11).toFixed(2);
          const datesW = textWidth(dates, 10);
          cmds.push('0 0 0 rg BT /F2 11 Tf 1 0 0 1 ' + LEFT.toFixed(2) + ' ' + baseline + ' Tm ' + pdfLiteral(title) + ' Tj ET');
          cmds.push('0.36 0.44 0.40 rg BT /F1 10 Tf 1 0 0 1 ' + (RIGHT - datesW).toFixed(2) + ' ' + baseline + ' Tm ' + pdfLiteral(dates) + ' Tj ET');
          y -= leading;
        } else {
          if (title) wrap(title, 11, MAX_W).forEach(line => draw(line, 11, 'F2', '0 0 0 rg', LEFT, 0));
          if (dates) wrap(dates, 10, MAX_W).forEach(line => draw(line, 10, 'F1', '0.36 0.44 0.40 rg', LEFT, 0));
        }
        (entry.lines || []).forEach(line => {
          paragraph(line, 11, 'F1', '0 0 0 rg', LEFT + (entry.bullets ? 4 : 0), MAX_W - (entry.bullets ? 8 : 0), !!entry.bullets);
        });
        y -= 6;
      });
      y -= 4;
    });

    if (cmds.length) pages.push(cmds);
    if (!pages.length) pages.push([]);
    return { width: PAGE_W, height: PAGE_H, pages };
  }

  function buildPdf(raw) {
    const laid = layoutPdf(resumeDocument(raw));
    const objects = [];
    function add(body) {
      objects.push(body);
      return objects.length;
    }
    add(''); // 1 catalog, filled after we know the pages id
    add(''); // 2 pages tree
    const font1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const font2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids = [];
    laid.pages.forEach(cmds => {
      const stream = cmds.join('\n');
      const data = stream ? stream + '\n' : '';
      const contentId = add('<< /Length ' + data.length + ' >>\nstream\n' + data + 'endstream');
      const pageId = add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + laid.width + ' ' + laid.height + '] /Contents ' + contentId + ' 0 R /Resources << /Font << /F1 ' + font1 + ' 0 R /F2 ' + font2 + ' 0 R >> >> >>');
      kids.push(pageId);
    });
    objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[1] = '<< /Type /Pages /Kids [' + kids.map(id => id + ' 0 R').join(' ') + '] /Count ' + kids.length + ' >>';

    let out = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((body, i) => {
      const id = i + 1;
      offsets[id] = out.length;
      out += id + ' 0 obj\n' + body + '\nendobj\n';
    });
    const startxref = out.length;
    const size = objects.length + 1;
    out += 'xref\n0 ' + size + '\n';
    out += '0000000000 65535 f \n';
    for (let id = 1; id < size; id++) {
      out += String(offsets[id]).padStart(10, '0') + ' 00000 n \n';
    }
    out += 'trailer\n<< /Size ' + size + ' /Root 1 0 R >>\nstartxref\n' + startxref + '\n%%EOF\n';
    return out;
  }

  root.HopewickResume = {
    STEPS,
    TIPS,
    SUMMARY_PROMPTS,
    LIMITS,
    emptyResume,
    emptyRole,
    emptyStudy,
    emptyRef,
    normalizeResume,
    resumeHasContent,
    resumeDocument,
    resumeFilename,
    buildPdf,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
