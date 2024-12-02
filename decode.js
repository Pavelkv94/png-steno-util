const Stenography = require("./stenography");

async function decode(outputng, file) {
  let output = await Stenography.openPNG(outputng);
  output.decodeFile(file);
}

decode("./data/output.png", "./data/result.txt")
