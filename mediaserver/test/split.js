const fs = require("fs");

const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);

const fpath = process.argv[2];
let imageStart = -1;
let imageEnd = -1;

let data = fs.readFileSync(fpath);
console.log("DATA LENGTH:", data.length);
let counter = 0;

while (1) {
    imageStart = data.indexOf(SOI);
    
    if (imageStart < 0) {
        console.log("SOI NOT FOUND");
        break;
    } else {
        console.log("SOI FOUND", imageStart);
    }

    imageEnd = data.indexOf(EOI, imageStart + SOI.length);

    if (imageEnd >= imageStart) {
        console.log("IMAGE FOUND", imageStart, imageEnd);
        counter ++;
        const img = data.slice(imageStart, imageEnd);
        fs.writeFileSync(`./${counter}.jpeg`, img);
        data = data.slice(imageEnd + EOI.length);
    } else {
        console.log("EOI NOT FOUND");
        break;
    }

    imageStart = imageEnd = -1;
}