const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun, ImageRun, Footer, AlignmentType, PageNumber } = require('docx');

const label = index => String.fromCharCode(65 + index);
const CORRECT_ANSWER_COLOUR = '8B0000';
const instructions = test => `Select the best answer for each question. Complete the assessment within ${test.duration} minutes.`;
function logo() {
  const file = [path.join(__dirname, '../client/dist/e-data-logo.png'), path.join(__dirname, '../client/public/e-data-logo.png')].find(fs.existsSync);
  if (!file) throw new Error('The E-Data logo asset is missing. Rebuild the client application.');
  const data = fs.readFileSync(file);
  return { data, width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

async function docx(test, includeAnswers) {
  const brand = logo();
  const runs = (text, options = {}) => String(text).split(/\r\n|\n|\r/).map((line, index) =>
    new TextRun({ text: line, ...(index ? { break: 1 } : {}), ...options }));
  const p = (text, options = {}) => new Paragraph({ ...options, children: runs(text, options.run) });
  const heading = (text, size = 26, options = {}) => p(text, {
    spacing: { before: 180, after: 100 }, keepNext: true, ...options, run: { bold: true, size }
  });
  const children = [
    new Paragraph({ spacing: { after: 280 }, children: [new ImageRun({ type: 'png', data: brand.data,
      transformation: { width: 150, height: Math.round(150 * brand.height / brand.width) },
      altText: { title: 'E-Data', description: 'E-Data Teknoloji logo', name: 'E-Data logo' }
    })] }),
    heading('Instructions'),
    p(instructions(test), { spacing: { after: 200 } }),
    heading('Questions', 28)
  ];
  test.questions.forEach((question, index) => {
    // Keep ordinary question blocks together; long questions may flow naturally over a page.
    const keepBlock = question.question_text.length + question.options.reduce((sum, item) => sum + item.text.length, 0) < 1400;
    children.push(heading(`Question ${index + 1}`, 24), p(question.domain, {
      keepNext: true, spacing: { after: 90 }, run: { size: 18, color: '555555' }
    }), p(question.question_text, { keepNext: true, spacing: { after: 130 } }));
    question.options.forEach((option, optionIndex) => children.push(p(`${label(optionIndex)}. ${option.text}`, {
      indent: { left: 240, hanging: 240 }, keepNext: keepBlock && optionIndex < question.options.length - 1,
      run: { color: includeAnswers && option.isCorrect ? CORRECT_ANSWER_COLOUR : '000000' },
      spacing: { after: optionIndex === question.options.length - 1 ? 240 : 80 }
    })));
  });
  return Packer.toBuffer(new Document({
    creator: 'E-Data', title: test.title, description: 'Assessment question paper',
    styles: { default: { document: { run: { font: 'Arial', size: 22, color: '000000' }, paragraph: { spacing: { line: 276 } } } } },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, right: 1100, bottom: 1100, left: 1100 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [
        new TextRun({ text: 'E-Data | ', size: 18, color: '555555' }),
        new TextRun({ children: [PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], size: 18, color: '555555' })
      ] })] }) }, children }]
  }));
}

function fontFiles() {
  const candidates = [
    [path.join(process.env.WINDIR || 'C:/Windows', 'Fonts/arial.ttf'), path.join(process.env.WINDIR || 'C:/Windows', 'Fonts/arialbd.ttf')],
    ['/usr/share/fonts/truetype/msttcorefonts/Arial.ttf', '/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf'],
    ['/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf', '/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf']
  ];
  const files = candidates.find(pair => pair.every(file => fs.existsSync(file)));
  if (!files) throw new Error('Arial-compatible Unicode fonts are required for PDF export. Install Arial on the server.');
  return files;
}

function pdf(test, includeAnswers) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: 'A4', margins: { top: 48, left: 52, right: 52, bottom: 58 }, bufferPages: true,
      info: { Title: test.title, Author: 'E-Data', Subject: 'Assessment question paper' } });
    const chunks = [];
    document.on('data', chunk => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
    try {
      const [regular, bold] = fontFiles();
      document.registerFont('Arial', regular).registerFont('Arial-Bold', bold).font('Arial');
      const brand = logo();
      const width = document.page.width - 104;
      const line = (text, { size = 11, bold = false, after = 7, indent = 0, colour = '#000000' } = {}) => {
        document.font(bold ? 'Arial-Bold' : 'Arial').fontSize(size).fillColor(colour)
          .text(text, 52 + indent, document.y, { width: width - indent, lineGap: 3 });
        document.y += after;
      };
      const reserve = height => { if (document.y + height > document.page.height - 58) document.addPage(); };
      document.image(brand.data, 52, 48, { width: 112 });
      document.y = 48 + 112 * brand.height / brand.width + 24;
      line('Instructions', { size: 13, bold: true });
      line(instructions(test), { after: 18 });
      line('Questions', { size: 15, bold: true, after: 13 });
      test.questions.forEach((question, index) => {
        document.font('Arial').fontSize(11);
        const blockHeight = 58 + document.heightOfString(question.question_text, { width, lineGap: 3 }) + question.options.reduce((sum, option, optionIndex) => sum + document.heightOfString(`${label(optionIndex)}. ${option.text}`, { width: width - 12, lineGap: 3 }) + 7, 0);
        // Preserve short blocks. Oversized blocks still have room for their heading and opening lines.
        reserve(blockHeight <= document.page.height - 106 ? blockHeight : 90);
        line(`Question ${index + 1}`, { size: 12, bold: true, after: 5 });
        line(question.domain, { size: 9, colour: '#555555', after: 9 });
        line(question.question_text, { after: 10 });
        question.options.forEach((option, optionIndex) => line(`${label(optionIndex)}. ${option.text}`, {
          indent: 12, colour: includeAnswers && option.isCorrect ? `#${CORRECT_ANSWER_COLOUR}` : '#000000'
        }));
        document.y += 11;
      });
      const pages = document.bufferedPageRange();
      for (let index = pages.start; index < pages.start + pages.count; index++) {
        document.switchToPage(index);
        // Footer must not create a new page when positioned below the normal bottom margin.
        document.page.margins.bottom = 0;
        document.font('Arial').fontSize(8).fillColor('#555555').text(`E-Data | ${index + 1} / ${pages.count}`, 52, document.page.height - 34, { width, align: 'right', lineBreak: false });
      }
      document.end();
    } catch (error) { document.destroy(); reject(error); }
  });
}

async function createTestExport(test, format, includeAnswers = false) {
  if (!test.questions.length) { const error = new Error('This test has no questions to export.'); error.status = 409; throw error; }
  return format === 'docx' ? docx(test, includeAnswers) : pdf(test, includeAnswers);
}
module.exports = { createTestExport };
