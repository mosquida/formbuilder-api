const express = require("express");
const app = express();
var cors = require("cors");
const fs = require("fs");
const path = require("path");
let { render } = require("mustache");
const { mdToPdf } = require("md-to-pdf");
const { google } = require("googleapis");

require("dotenv").config();

app.use(cors());

// JSON parser
app.use(express.json());

app.use(express.static(path.join(__dirname, "/build")));

// Handling Middleware Error, Beutifies Return Message
app.use((err, req, res, next) => {
  if (err) return res.json(err);
  next();
});

app.post("/", (req, res) => {
  // if (
  //   req.body.firstName &&
  //   req.body.middleName &&
  //   req.body.lastName &&
  //   req.body.authFirstName &&
  //   req.body.authMiddleName &&
  //   req.body.authLastName &&
  //   req.body.amount &&
  //   req.body.franchise &&
  //   req.body.signature
  // ) {
  //   return res.json({ message: "errsds" }).status(500);
  // }
  function capitalizeFirstLetter(str) {
    arr = str.split(" ");
    str = "";
    for (let a of arr) {
      b = a.charAt(0).toUpperCase() + a.slice(1) + " ";
      str += b;
    }
    return str;
  }

  let clientName = `${req.body.firstName} ${req.body.middleName} ${req.body.lastName}`;
  let authName = `${req.body.authFirstName} ${req.body.authMiddleName} ${req.body.authLastName}`;

  clientName = capitalizeFirstLetter(clientName);
  authName = capitalizeFirstLetter(authName);

  let date = new Date();
  let day = date.getDate();
  let month = date.getMonth() + 1;
  let year = date.getFullYear();

  let fullDate = `${getMonth(month)} ${day}, ${year}`;

  function getMonth(month) {
    let monthFull = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    return monthFull[month - 1];
  }

  const dateToday = fullDate;

  const data = {
    client_name: clientName,
    client_name_up: clientName.toUpperCase(),
    auth_name: authName,
    amount: req.body.amount,
    franchise: req.body.franchise,
    signature: req.body.signature,
    date: dateToday,
  };

  // res.send(data);

  // POPULATE MD from TEMPLATE
  const template = fs.readFileSync("./contracts/template.md").toString();
  const contractNameMd = `./contracts/${clientName} - ${dateToday}.md`;
  const contractNamePdf = `./contracts/${clientName} - ${dateToday}.pdf`;

  const buf = render(template, data);
  fs.writeFile(contractNameMd, buf, () => {
    start();
  });

  // MD RO PDF
  const start = async () => {
    const pdf = await mdToPdf({
      path: contractNameMd,
    }).catch((err) => {
      console.log(err);
      return res.json({ message: "err" }).status(500);
    });

    if (pdf)
      fs.writeFile(contractNamePdf, pdf.content, function () {
        appendValues()
          .then((data) => {
            return;
          })
          .catch((err) => {
            return res.json({ message: "err" }).status(500);
          });
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
  };

  // APPEND TO EXCEL
  async function appendValues() {
    const auth = new google.auth.GoogleAuth({
      keyFile: "./googlekey.json",
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheetService = google.sheets({
      version: "v4",
      auth,
    });

    try {
      let values = [
        [
          req.body.firstName,
          req.body.middleName,
          req.body.lastName,
          req.body.franchise,
          req.body.amount,
          req.body.authFirstName,
          req.body.authMiddleName,
          req.body.authLastName,
          `${clientName} - ${dateToday}.pdf`,
        ],
      ];

      const resource = {
        values,
      };

      const result = await sheetService.spreadsheets.values.append({
        spreadsheetId: process.env.GOOGLE_API_SHEET_ID,
        range: "Sheet1",
        valueInputOption: "RAW",
        resource: resource,
      });

      console.log(`${result.data.updates.updatedCells} cells appended.`);
      return result;
    } catch (err) {
      console.log("Data appending to sheet error", err);
      throw err;
    }
  }

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
        name: `${clientName} - ${dateToday}.pdf`,
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
      throw err;
    }
  }

  // DELETE THE LOCAL FILE
  function deleteFiles(f1, f2) {
    fs.unlinkSync(f1);
    fs.unlinkSync(f2);
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "build/index.html"));
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`API running on port ${port}`);
});
