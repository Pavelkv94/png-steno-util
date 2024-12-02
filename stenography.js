const crypto = require('crypto');
const fs = require("fs")
const { PNG } = require("pngjs");
const { gzipSync, gunzipSync } = require("zlib");

module.exports = class Stenography {
  png;

  constructor(png) {
    if (png.data.length < 4) {
      throw new Error("Cant use this PNG file");
    }

    this.png = png;
  }

  hashData(binaryData) {
    return crypto.createHash("sha256").update(binaryData).digest();
  }

  deriveAESKey(key) {
    return crypto.createHash("sha256").update(key).digest();
  }

  unmask(pixels) {
    let bytes = [];
    let dataBitIndex = 0;
    let currentByte = 0;

    for (let i = 0; i < pixels.length; i += 4) {
      for (let j = 0; j < 3; j++) {
        let bit = pixels[i + j] & 1;

        currentByte = (currentByte << 1) | bit;
        dataBitIndex++;

        if (dataBitIndex % 8 === 0) {
          bytes.push(currentByte);
          currentByte = 0;
        }
      }
    }

    return Buffer.from(bytes);
  }

  mask(pixels, data) {
    let outputBuffer = Buffer.from(pixels);

    let dataBitIndex = 0;

    for (let i = 0; i < outputBuffer.length; i += 4) {
      for (let j = 0; j < 3; j++) {
        let bit = dataBitIndex < data.length * 8 ? (data[Math.floor(dataBitIndex / 8)] >> (7 - (dataBitIndex % 8))) & 1 : crypto.randomInt(2);

        outputBuffer[i + j] = (outputBuffer[i + j] & 0xfe) | bit;
        dataBitIndex++;
      }
    }

    return outputBuffer;
  }

  clone(buffer = null) {
    let outputPicture = new PNG({
      width: this.png.width,
      height: this.png.height,
    });

    if (!buffer) {
      buffer = this.png.data;
    }

    buffer.copy(outputPicture.data);

    return new Stenography(outputPicture);
  }

  getAvailableEncodeBytes() {
    return (Math.floor(this.png.data.length / 4) * 3) / 8;
  }

  /**
   * Открыть существующий файл
   */
  static async openPNG(path) {
    return new Promise((resolve) => {
      return fs
        .createReadStream(path)
        .pipe(new PNG())
        .on("parsed", function () {
          resolve(new Stenography(this));
        });
    });
  }

  /**
   * Свободное место в хранилище
   */
  getMemorySize() {
    return this.getAvailableEncodeBytes() - 4 - 32;
  }

  /**
   * Раскодировать изображение
   */
  decode(binary = false) {
    if (this.png.data.length < 96 * 4) {
      throw new Error("Cant decode this container");
    }

    let meta = this.unmask(this.png.data.slice(0, 96 * 4));

    let length = meta.readUInt32BE();
    let hash = meta.slice(4, 36);

    let data = this.unmask(this.png.data).slice(36, 36 + length);

    if (!this.hashData(data).equals(hash)) {
      throw new Error("Cant decode this container");
    }

    let unzippedData = gunzipSync(data);

    return binary ? unzippedData : new TextDecoder().decode(unzippedData);
  }

  /**
   * Закодировать изображение
   */
  encode(data) {
    let binaryData = typeof data === "string" ? Buffer.from(data, "utf-8") : Buffer.from(data);

    /**
     * Сжимаем для экономии места
     */
    let compressedBinaryData = gzipSync(binaryData);

    /**
     * Записываем длину данных
     */
    let length = Buffer.alloc(4);
    length.writeUInt32BE(compressedBinaryData.length, 0);

    /**
     * Записываем хэш данных
     */
    let hash = this.hashData(compressedBinaryData);

    /**
     * Собираем все вместе
     */
    let serializedData = Buffer.concat([length, hash, compressedBinaryData]);

    if (serializedData.length > this.getAvailableEncodeBytes()) {
      throw new Error("Message is too long");
    }

    return this.clone(this.mask(this.png.data, serializedData));
  }

  /**
   * Сохранение картинки
   */
  async saveToFile(path) {
    let stream = fs.createWriteStream(path);

    this.png.pack().pipe(stream);

    return new Promise((resolve) => {
      stream.on("finish", resolve);
    });
  }

  /**
   * Закодировать изображение с AES ключом
   */
  encodeWithKey(key, data) {
    let cryptoKey = this.deriveAESKey(key);

    let binaryData = typeof data === "string" ? Buffer.from(data, "utf-8") : Buffer.from(data);

    let iv = crypto.randomBytes(16);
    let cipher = crypto.createCipheriv("aes-256-cbc", cryptoKey, iv);
    let encryptedData = Buffer.concat([cipher.update(binaryData), cipher.final()]);

    let finalData = Buffer.concat([iv, encryptedData]);

    return this.encode(finalData);
  }

  /**
   * Раскодировать изображение с AES ключом
   */
  decodeWithKey(key, binary = false) {
    let cryptoKey = crypto.createHash("sha256").update(key).digest();

    let encodedData = this.decode(true);

    let iv = encodedData.slice(0, 16);
    let encryptedData = encodedData.slice(16);

    let decipher = crypto.createDecipheriv("aes-256-cbc", cryptoKey, iv);
    let decryptedData = Buffer.concat([decipher.update(encryptedData), decipher.final()]);

    // Возвращаем расшифрованные данные
    return binary ? decryptedData : new TextDecoder().decode(decryptedData);
  }

  /**
   * Закодировать файл внутрь изображения
   */
  encodeFile(fromDataPath) {
    let dataBuffer = fs.readFileSync(fromDataPath);

    return this.encode(dataBuffer);
  }

  /**
   * Раскодировать файл внутри изображения
   */
  decodeFile(toDataPath) {
    let decode = this.decode(true);

    fs.writeFileSync(toDataPath, decode);
  }

  /**
   * Закодировать файл внутрь изображения с AES ключом
   */
  encodeFileWithKey(key, fromDataPath) {
    let dataBuffer = fs.readFileSync(fromDataPath);

    return this.encodeWithKey(key, dataBuffer);
  }

  /**
   * Раскодировать файл внутри изображения с AES ключем
   */
  decodeFileWithKey(key, toDataPath) {
    let decode = this.decodeWithKey(key, true);

    fs.writeFileSync(toDataPath, decode);
  }
}
