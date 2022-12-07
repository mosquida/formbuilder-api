const express = require("express");
const app = express();
var cors = require("cors");
const fs = require("fs");
let { render } = require("mustache");
const { mdToPdf } = require("md-to-pdf");
const { google } = require("googleapis");

require("dotenv").config();

app.use(cors());

// JSON parser
app.use(express.json());

// Handling Middleware Error, Beutifies Return Message
app.use((err, req, res, next) => {
  if (err) return res.json(err);
  next();
});

app.post("/", (req, res) => {
  const clientName = `${req.body.firstName} ${req.body.middleName} ${req.body.lastName}`;
  const authName = `${req.body.authFirstName} ${req.body.authMiddleName} ${req.body.authLastName}`;

  const data = {
    client_name: clientName,
    auth_name: authName,
    amount: req.body.amount,
    franchise: req.body.franchise,
    signature: req.body.signature,
  };

  // res.send(data);

  // POPULATE MD
  const template = fs.readFileSync("./contracts/template.md").toString();
  const date = Date.now();
  const contractNameMd = `./contracts/${clientName}-${date}.md`;
  const contractNamePdf = `./contracts/${clientName}-${date}.pdf`;

  const buf = render(template, data);
  fs.writeFileSync(contractNameMd, buf);

  // MD RO PDF
  (async () => {
    const pdf = await mdToPdf({
      path: contractNameMd,
    }).catch((err) => {
      console.log(err);
      return res.json({ message: "err" }).status(500);
    });

    if (pdf)
      fs.writeFile(contractNamePdf, pdf.content, function () {
        uploadFile()
          .then((data) => {
            // res.download(contractNamePdf)
            deleteFiles(contractNamePdf, contractNameMd);
            return res.json({ message: "ok" }).status(200);
          })
          .catch((err) => {
            return res.json({ message: "err" }).status(500);
          });
      });
  })();

  // PDF TO DRIVE
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

      const fileMetaData = {
        name: `${clientName}-${date}.pdf`,
        parents: [process.env.GOOGLE_API_FOLDER_ID],
      };

      const media = {
        mimeType: "application/pdf",
        body: fs.createReadStream(contractNamePdf),
      };

      const response = await driveService.files.create({
        resource: fileMetaData,
        media: media,
        field: "id",
      });
      return response.data.id;
      // return response.data;
    } catch (err) {
      console.log("Upload file error", err);
    }
  }

  // DELETE THE LOCAL FILE
  function deleteFiles(f1, f2) {
    fs.unlinkSync(f1);
    fs.unlinkSync(f2);
  }
});

const port = process.env.PORT || 5000;

app.listen(port, () => {
  console.log(`API running on port ${port}`);
});
