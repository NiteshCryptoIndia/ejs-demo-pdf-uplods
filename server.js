const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer');
const axios = require('axios');
const app = express();
const PORT = 3000;

// Preview route: renders preview.ejs with all form data
app.post('/preview', async (req, res) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).send('Form data missing. Please fill the form and try again.');
  }
  const { signature, companyName, directorName, mobileNumber, declarationDate, imageBase64 } = req.body;
  if (!signature || !companyName || !directorName || !mobileNumber || !declarationDate || !imageBase64) {
    return res.status(400).send('Some required fields are missing. Please fill the form and try again.');
  }
  const imagePath = imageBase64 || '';
  const signaturePath = signature || '';
  res.render('preview', {
    directorName,
    companyName,
    mobileNumber,
    declarationDate,
    imagePath,
    signaturePath
  });
});

// Download PDF route: generates PDF from preview and sends as download
app.post('/download-pdf', async (req, res) => {
  const { signature, companyName, directorName, mobileNumber, declarationDate, imageBase64 } = req.body;
  const imagePath = imageBase64 || '';
  const signaturePath = signature || '';
  const htmlContent = await renderEJS({
    directorName,
    companyName,
    mobileNumber,
    declarationDate,
    imagePath,
    signaturePath,
  });
  const pdfBuffer = await generatePDF(htmlContent);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': 'attachment; filename="declaration.pdf"',
    'Content-Length': pdfBuffer.length
  });
  res.send(pdfBuffer);
});




app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(bodyParser.json({ limit: '10mb' }));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});
const upload = multer({ storage });

// Load initial form with dummy data or API data
app.get('/', async (req, res) => {
  const directorName = "John Doe";
  const companyName = "Demo Pvt Ltd";
  const mobileNumber = "9876543210";
  const declarationDate = new Date().toLocaleDateString();

  res.render('declaration', {
    directorName,
    companyName,
    mobileNumber,
    declarationDate,
    imagePath: '',
    signaturePath: ''
  });
});

// Save signature from base64
app.post('/save-signature', (req, res) => {
  const dataURL = req.body.image;
  const base64Data = dataURL.replace(/^data:image\/png;base64,/, "");
  const filename = Date.now() + "-signature.png";
  const filepath = path.join(__dirname, 'public/uploads', filename);

  fs.writeFileSync(filepath, base64Data, 'base64');
  res.json({ filename });
});

// Submit and generate PDF
app.post('/submit-form', async (req, res) => {
  const { signature, companyName, directorName, mobileNumber, declarationDate, imageBase64 } = req.body;

  // Use base64 image and signature directly
  const imagePath = imageBase64 || '';
  const signaturePath = signature || '';

  const htmlContent = await renderEJS({
    directorName,
    companyName,
    mobileNumber,
    declarationDate,
    imagePath,
    signaturePath,
  });

  const pdfBuffer = await generatePDF(htmlContent);

  // Save PDF to server (optional: you can also send to client directly)
  await axios.post('http://localhost:3000/uploads', pdfBuffer, {
    headers: { 'Content-Type': 'application/pdf' }
  });

  res.send('PDF Submitted Successfully!');
});


// Make sure public/uploads folder exists
const uploadFolder = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadFolder)) {
  fs.mkdirSync(uploadFolder, { recursive: true });
}

// Route to save PDF
app.post('/uploads', express.raw({ type: 'application/pdf', limit: '10mb' }), (req, res) => {
  const filename = `form_${Date.now()}.pdf`;
  const filePath = path.join(uploadFolder, filename);

  fs.writeFile(filePath, req.body, (err) => {
    if (err) {
      console.error("Failed to save PDF:", err);
      return res.status(500).send("Failed to save PDF");
    }
    res.json({ success: true, filename });
  });
});
// Helper: save base64 image
function saveBase64Image(base64, name) {
  const filename = Date.now() + '-' + name;
  const filepath = path.join(__dirname, 'public/uploads', filename);
  const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
  fs.writeFileSync(filepath, base64Data, 'base64');
  return `/uploads/${filename}`;
}

// Helper: render final HTML
async function renderEJS({ directorName, companyName, mobileNumber, declarationDate, imagePath, signaturePath }) {
  return new Promise((resolve, reject) => {
    app.render('declaration', {
      directorName,
      companyName,
      mobileNumber,
      declarationDate,
      imagePath,
      signaturePath
    }, (err, html) => {
      if (err) return reject(err);
      resolve(html);
    });
  });
}

// Generate PDF using Puppeteer
async function generatePDF(htmlContent) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setContent(htmlContent);
  const buffer = await page.pdf({ format: 'A4' });
  await browser.close();
  return buffer;
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
