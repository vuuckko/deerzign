/* Minimalni ZIP builder — bez biblioteke, bez CDN-a.
 *
 * Pakuje "store" metodom (bez kompresije). To ovde ništa ne košta: brief.html
 * fotografije već šalje kao JPEG, a JPEG/PNG/PDF se deflate-om ionako ne
 * smanjuju. Zauzvrat nema zavisnosti koja može da padne ili da se promeni.
 *
 * Ograničenje: nema zip64, dakle do 4 GB. Forma dozvoljava 25 MB po prijavi.
 *
 * window.makeZip([{name, data:Uint8Array}, ...]) -> Blob
 */
(function () {
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(buf) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /* DOS vreme — sekunde imaju rezoluciju od 2s, tako format nalaže */
  function dosTime(d) {
    return ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
  }
  function dosDate(d) {
    return (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  }

  /* Imena su UTF-8 (bit 11 u flag-u), pa ćirilica i š/đ/č/ć/ž prolaze */
  function encodeName(name) {
    return new TextEncoder().encode(name);
  }

  /* Isto ime dvaput u istom zip-u pravi fajl koji se raspakuje nepredvidivo */
  function uniqueNames(entries) {
    var seen = Object.create(null);
    return entries.map(function (e) {
      var name = e.name || 'fajl';
      if (!seen[name]) { seen[name] = 1; return { name: name, data: e.data }; }
      var dot = name.lastIndexOf('.');
      var base = dot > 0 ? name.slice(0, dot) : name;
      var ext = dot > 0 ? name.slice(dot) : '';
      var n = seen[name]++;
      return { name: base + ' (' + n + ')' + ext, data: e.data };
    });
  }

  window.makeZip = function (rawEntries) {
    var entries = uniqueNames(rawEntries);
    var now = new Date();
    var time = dosTime(now), date = dosDate(now);

    var parts = [];      // Uint8Array delovi, redom
    var central = [];    // zapisi centralnog direktorijuma
    var offset = 0;

    entries.forEach(function (e) {
      var nameBytes = encodeName(e.name);
      var data = e.data;
      var crc = crc32(data);

      var local = new Uint8Array(30 + nameBytes.length);
      var lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);   // potpis
      lv.setUint16(4, 20, true);           // verzija
      lv.setUint16(6, 0x0800, true);       // flag: UTF-8 ime
      lv.setUint16(8, 0, true);            // metoda: store
      lv.setUint16(10, time, true);
      lv.setUint16(12, date, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true); // komprimovana
      lv.setUint32(22, data.length, true); // originalna
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);           // extra
      local.set(nameBytes, 30);

      parts.push(local, data);

      var cd = new Uint8Array(46 + nameBytes.length);
      var cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);           // napravio
      cv.setUint16(6, 20, true);           // potrebna verzija
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, time, true);
      cv.setUint16(14, date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);           // extra
      cv.setUint16(32, 0, true);           // komentar
      cv.setUint16(34, 0, true);           // disk
      cv.setUint16(36, 0, true);           // interni atributi
      cv.setUint32(38, 0, true);           // eksterni atributi
      cv.setUint32(42, offset, true);      // gde počinje lokalni header
      cd.set(nameBytes, 46);
      central.push(cd);

      offset += local.length + data.length;
    });

    var centralSize = central.reduce(function (n, c) { return n + c.length; }, 0);

    var end = new Uint8Array(22);
    var ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    return new Blob(parts.concat(central, [end]), { type: 'application/zip' });
  };
})();
