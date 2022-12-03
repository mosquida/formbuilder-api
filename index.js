const express = require("express");
const app = express();
const path = require("path");
const fs = require("fs");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

const libre = require("libreoffice-convert");
libre.convertAsync = require("util").promisify(libre.convert);

const { google } = require("googleapis");

require("dotenv").config();

// JSON parser
app.use(express.json());

// Handling Middleware Error, Beutifies Return Message
app.use((err, req, res, next) => {
  if (err) return res.json(err);
  next();
});

app.get("/", (req, res) => {
  // RESPONSE TO DOCX

  // Load the docx file as binary content
  const content = fs.readFileSync(
    path.resolve(__dirname, "input.docx"),
    "binary"
  );

  const zip = new PizZip(content);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  // Render the document (Replace {first_name} by John, {last_name} by Doe, ...)
  doc.render({
    first_name: "John",
    last_name: "Doe",
    phone: "0652455478",
    description: "New Website",
  });

  const buf = doc.getZip().generate({
    type: "nodebuffer",
    // compression: DEFLATE adds a compression step.
    // For a 50MB output document, expect 500ms additional CPU time
    compression: "DEFLATE",
  });

  // buf is a nodejs Buffer, you can either write it to a
  // file or res.send it with express for example.
  fs.writeFileSync(path.resolve(__dirname, "output.docx"), buf);

  // DOCX TO PDF
  const ext = ".pdf";
  const inputPath = path.join(__dirname, "/output.docx");
  const outputPath = path.join(__dirname, `/test.pdf`);

  // Read file
  const docxBuf = fs.readFile(inputPath, function (err, b) {
    // Convert it to pdf format with undefined filter (see Libreoffice docs about filter)
    libre.convert(b, ext, undefined, function (err, buf) {
      // Here in done you have pdf file which you can save or transfer in another stream
      fs.writeFileSync(outputPath, buf);
    });
  });

  // PDF RTO DRIVE
  async function uploadFile() {
    try {
      const auth = new google.auth.GoogleAuth({
        keyFile: "./googlekey.json",
        scopes: ["https://www.googleapis.com/auth/drive"],
      });

      const driveService = google.drive({
        version: "v3",
        auth,
      });
      console.log(process.env.GOOGLE_API_FOLDER_ID);

      const fileMetaData = {
        name: "test.pdf",
        parents: [process.env.GOOGLE_API_FOLDER_ID],
      };

      const media = {
        mimeType: "application/pdf",
        body: fs.createReadStream("test.pdf"),
      };

      const response = await driveService.files.create({
        resource: fileMetaData,
        media: media,
        field: "id,name",
      });
      // return response.data.id;
      return response.data;
    } catch (err) {
      console.log("Upload file error", err);
    }
  }

  uploadFile().then((data) => {
    console.log(data);
    return res.download(path.join(__dirname, "test.pdf"));
    // return res.send(data);
    //https://drive.google.com/uc?export=view&id=1_uWvPzbaljbOieHpXooXUMDuFr92aOph
  });

  // DELETE THE LOCAL FILE
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`API running on port ${port}`);
});
