import { test } from "node:test";
import assert from "node:assert/strict";
import { streetKeys, findKeys, addressRu, addressLocal, splitAddresses, translitRu, skel } from "../src/georgian.ts";

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
  // Telasi's live lists shorten the lane to "შეს.".
  assert.equal(addressRu("ცხემის შეს"), "Цхеми пер.");
  assert.equal(addressRu("შატბერაშვილის III შეს"), "Шатберашвили III пер.");
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

// Addresses as the providers wrote them on 20 October 2026.

test("a path of places is translated part by part, the street word with its street", () => {
  assert.equal(addressRu("ყვარელი, ილ.ჭავჭავაძეს ქუჩა"), "Кварели, ул. Ил. Чавчавадзе");
  assert.equal(addressRu("მესტია, მესტია, ბ.კახიანის ქ"), "Местия, ул. Б. Кахиани"); // the town once
  assert.equal(addressRu("დაბა ახალდაბა. ყაზბეგის ქ"), "пос. Ахалдаба, ул. Казбеги");
  assert.equal(addressRu("შუახევი, შუახევი, თამარ მეფის ქ.№14"), "Шуахеви, ул. Тамар Мепи №14");
  assert.equal(addressRu("ბათუმის 25, 38"), "Батуми 25, 38"); // house numbers stay with their street
});

test("a Tbilisi suburb in front is a qualifier, and Telasi's abbreviations are spelled out", () => {
  assert.equal(addressRu("(სოფ.ახალდაბა)იეთიმ გურჯის ქ"), "ул. Иетим Гурджи (с. Ахалдаба)");
  assert.equal(addressRu("(წყნ)ახალდაბის ქ"), "ул. Ахалдаби (Цкнети)");
  assert.equal(addressRu("გრიგოლ ლორთქიფანიძის ქ.(სამგ)"), "ул. Григол Лорткипанидзе (Самгори)");
  assert.equal(addressRu("სოფ.ახალდაბა(მე-2ჩიხი)"), "с. Ахалдаба (2-й туп.)");
  assert.equal(addressLocal("სოფ.ახალდაბა(მე-2ჩიხი)", "en"), "Village Akhaldaba (2nd Dead End)");
  // The closing parenthesis used to be lost.
  assert.equal(addressRu("მარჯვენა სანაპირო(9 მარტის მიმდებარე ტერიტორია)"), "Марджвена Санапиро (9 марта окрестности терр.)");
});

test("a village and a street in one part become two", () => {
  assert.equal(addressRu("ქ თბილისი, სოფელი დიღომი დიდგორის ქუჩა"), "г. Тбилиси, с. Дигоми, ул. Дидгори");
  assert.equal(addressRu("ს. ნუკრიანი წმინდა ნინოს ქ."), "с. Нукриани, ул. Цминда Нино");
  assert.equal(addressRu("ს. ნოჯიხევი 2 ქ."), "с. Ноджихеви, ул. 2");
  assert.equal(addressRu("ს. ქვემო ქვალონი"), "с. Квемо Квалони");
  assert.equal(addressRu("სოფ. ჭოგნარის ნაწილი"), "с. Чогнари (частично)");
  assert.equal(addressRu("მარნეული, სამხედრო ნაწილი"), "Марнеули, Самхедро Нацили"); // a military unit
});

test("ს. is a village, or an initial before a person's name", () => {
  assert.equal(addressRu("შუახევი, შუახევი, ს. ხიმშიაშვილის ქ №9"), "Шуахеви, ул. С. Химшиашвили №9");
  assert.equal(addressRu("ს. ბია"), "с. Бия");
});

test("ქ is the town before the first place, the street anywhere else", () => {
  assert.equal(addressRu("ქ თბილისი, სოფელი დიღომი"), "г. Тбилиси, с. Дигоми");
  assert.equal(addressRu("ზესტაფონი, ქ. წამებულის"), "Зестапони, ул. Цамебули");
});

test("settlements, quarters, dates and ordinals", () => {
  assert.equal(addressRu("დაბა კულაში"), "пос. Кулаши");
  assert.equal(addressRu("(წყნ)დაბა"), "Даба (Цкнети)"); // a quarter called Daba
  assert.equal(addressRu("ცაიში, ჯუმის უბანი"), "Цайши, Джуми квартал");
  assert.equal(addressRu("ბორჯომი, ბაკურიანი, 9 აპრილის ქუჩა"), "Борджоми, Бакуриани, ул. 9 апреля");
  assert.equal(addressRu("რუსთავი, მე-16"), "Рустави, 16-й");
  assert.equal(addressRu("ჭიხარულა"), "Чихарула"); // not a dead end, ჩიხი
  assert.equal(addressRu("ბორჯომი, ბაკურიანი, რაიმონდ (გურამ) გოგოლაძის"), "Борджоми, Бакуриани, Раймонд (Гурам) Гоголадзе");
});
