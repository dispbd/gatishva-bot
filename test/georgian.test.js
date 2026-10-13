import { test } from "node:test";
import assert from "node:assert/strict";
import { streetKeys, findKeys, addressRu, splitAddresses, translitRu, skel } from "../src/georgian.ts";

const found = (text, query) => findKeys(text, streetKeys(query)).map(([a, b]) => text.slice(a, b));

test("one street, typed in any of three scripts, gives the same key", () => {
  const k = streetKeys("Политковская")[0];
  assert.equal(streetKeys("Politkovskaya")[0], k);
  assert.equal(streetKeys("ул. Политковская")[0], k);
  assert.ok(streetKeys("ანა პოლიტკოვსკაია").includes(k));
});

test("Georgian's three k's, two t's and two ch's are one letter to a Russian reader", () => {
  assert.equal(skel("ქ"), skel("კ"));
  assert.equal(skel("ყ"), skel("к"));
  assert.equal(skel("ჭ"), skel("ч"));
  assert.equal(skel("ჩ"), skel("ch"));
  assert.equal(skel("წ"), skel("ц"));
  assert.equal(skel("ც"), skel("ts"));
});

test("a street is found in whatever case the provider put it", () => {
  const text = "მიტროფანე ლაღიძის, ზურაბ ჟვანიას, ალექსანდრე ჭავჭავაძის შესახვევებით, ვაჟა-ფშაველას გამზ.";
  assert.deepEqual(found(text, "Жвания"), ["ჟვანიას"]);
  assert.deepEqual(found(text, "Чавчавадзе"), ["ჭავჭავაძის"]);
  assert.deepEqual(found(text, "Ilia Chavchavadze avenue"), ["ჭავჭავაძის"]);
  assert.deepEqual(found(text, "Важа-Пшавела"), ["ვაჟა-ფშაველას"]);
  assert.deepEqual(found(text, "Лагидзе"), ["ლაღიძის"]);
});

test("a word broken by a stray space still matches", () => {
  // Telasi's texts really look like this: "კიტა ბუაჩი ძის".
  assert.deepEqual(found("კიტა ბუაჩი ძის, ბაკურციხის", "Буачидзе"), ["ბუაჩი ძის"]);
});

test("a match must start a word: Ваке is not inside Даваке", () => {
  assert.deepEqual(found("ქავთარაძის, დავაკეთის", "Ваке"), []);
});

test("too short to mean anything is refused", () => {
  assert.deepEqual(streetKeys("ул. Ана"), []);
  assert.deepEqual(streetKeys("пр."), []);
});

test("numbers are part of a name: 26 мая", () => {
  assert.deepEqual(found("26 მაისის მოედანი, 1 მაისის", "26 мая"), ["26 მაისის"]);
});

test("addresses read like Russian addresses", () => {
  assert.equal(addressRu("ალექსანდრე ჭავჭავაძის ქ. N 4"), "ул. Александре Чавчавадзе № 4");
  assert.equal(addressRu("ანა პოლიტკოვსკაიას ქ. N32-50 (ლუწებს)"), "ул. Ана Политковская № 32-50 (чёт.)");
  assert.equal(addressRu("ვაჟა-ფშაველას გამზ"), "пр. Важа-Пшавела");
  assert.equal(addressRu("ყაზბეგის გამზირის"), "пр. Казбеги");
  assert.equal(addressRu("გრიბოედოვის"), "Грибоедов");
  assert.equal(addressRu("ტეხურის N31-39(კენტებს)"), "Техури № 31-39 (нечёт.)");
});

test("a Roman numeral glued to its word is split off", () => {
  assert.equal(addressRu("ილია ბახტაძის Iშესახვევის"), "Илия Бахтадзе I пер.");
});

test("an enumeration splits on commas and the final 'and'", () => {
  assert.deepEqual(splitAddresses("გალის, თარხნიშვილის და პეტრიაშვილის"), ["გალის", "თარხნიშვილის", "პეტრიაშვილის"]);
});

test("'and' inside one place does not split it", () => {
  assert.deepEqual(splitAddresses("ბესიკის, ჭავჭავაძის შესახვევებით და ჩიხებით"), [
    "ბესიკის",
    "ჭავჭავაძის შესახვევებით და ჩიხებით",
  ]);
});

test("transliteration follows Russian habits", () => {
  assert.equal(translitRu("ჟვანია"), "Жвания");
  assert.equal(translitRu("ერეკლე"), "Эрекле");
  assert.equal(translitRu("თეიმურაზ"), "Теймураз");
});

test("house numbers after a comma stay with their street", () => {
  // GWP, 8 October: "ბათუმის 25, 38, წერეთლის 6, 10, 12" came out as five places.
  assert.deepEqual(splitAddresses("ბათუმის 25, 38, წერეთლის 6, 10, 12, იამანიძის ქ."), [
    "ბათუმის 25, 38",
    "წერეთლის 6, 10, 12",
    "იამანიძის ქ", // the list's closing full stop goes
  ]);
  assert.deepEqual(splitAddresses("ტეხურის N31-39, N 41, ბაკურიანის"), ["ტეხურის N31-39, N 41", "ბაკურიანის"]);
});

test("a name that drops a vowel before its ending gets it back", () => {
  assert.equal(addressRu("წერეთლის 6, 10, 12"), "Церетели 6, 10, 12");
  assert.equal(addressRu("ვახტანგ გორგასლის ქ."), "ул. Вахтанг Горгасали");
  assert.equal(addressRu("დავით აღმაშენებლის გამზ."), "пр. Давит Агмашенебели");
});
