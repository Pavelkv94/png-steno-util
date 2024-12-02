const Stenography = require("./stenography");

async function encode(inputPng, outputng, file) {
  let input = await Stenography.openPNG(inputPng);
  await input.encodeFile(file).saveToFile(outputng);
}

encode("./data/input.png", "./data/output.png", "./data/file.txt");
