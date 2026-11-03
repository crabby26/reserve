// All in-game copy. Written for this game.
window.ReserveTexts = (function () {
  'use strict';

  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  const T = {
    cars: ['Kombi Wüstenfuchs', 'Pritsche Trockenpflaume'],
    bot: 'Onkel Horst',

    stations: [
      'Zur letzten Hoffnung', 'Tank & Bereue', 'Super oder Superteuer', 'Zapf dich weg',
      'Bei Erika (meistens zu)', 'Benzin & Bockwurst', 'Oase Light', 'Diesel-Dieters Resterampe',
      'Kurz vor Nirgendwo', 'Rast & Rost', 'Sprit & Spott', 'Zum durstigen Vergaser',
    ],
    pump: [
      'Kiosk: „Das Klo ist hinten. Hinten ist die Wüste.“',
      'Der Tankwart nickt. Er nickt seit 1987.',
      'Bockwurst im Angebot. Haltbar bis letztes Jahrzehnt.',
      'An der Kasse: „Punkte sammeln Sie? Ich auch.“',
      'Das Benzin riecht nach Abenteuer. Und ein bisschen nach Suppe.',
      'Schild am Kiosk: „Kaffee aus. Hoffnung auch.“',
      'Der Automat gibt Wechselgeld in Kronkorken.',
      'Der Tankwart fragt, ob du den Wagen verkaufen willst. Dann lacht er lange.',
    ],
    dry: [
      'Zapfsäule leer. Sie röchelt mitfühlend.',
      'Tankstelle ausgesoffen. Der Tankwart zeigt in eine beliebige Richtung.',
      'Hier gibt es nur noch Bockwurst. Bockwurst brennt schlecht.',
    ],
    otherDrained: [
      '{o} hat die Tanke leergesoffen.',
    ],
    empty: [
      'Tank leer. Aussteigen und schieben. Ein Kanister liegt voraus.',
      'Der Motor hat gekündigt. Schieben ist das neue Fahren.',
      'Sprit alle. Dafür gute Luft. Schieb zum Kanister.',
    ],
    otherEmpty: ['{o} schiebt jetzt. Hup doch mal.', '{o} ist trocken. Schön langsam vorbeifahren.'],
    can: ['Kanister! Riecht fast wie Benzin.', '25 Liter Glück in einem verbeulten Kanister.'],
    canStolen: ['Du hast den Kanister von {o} geklaut. Schäm dich. Später.'],
    canLost: ['{o} hat deinen Kanister geklaut! Ein neuer liegt weiter vorn.'],
    go: ['Los! Sprit sparen, Würde vergessen.', 'Los! Das Navi empfiehlt umzukehren.'],
    horn: ['TRÖÖÖT', 'MÖÖÖP', 'HUUUP', 'TÄTÄÄÄ', 'QUIEK'],

    itemNames: { oil: 'Ölspur', cow: 'Bertha', gag: 'Platten-Gag', mirage: 'Fata Morgana' },
    itemIcons: { oil: 'Öl', cow: 'Kuh', gag: 'Gag', mirage: 'Fata' },
    crate: {
      oil: 'Ölspur gefunden. Fünf Liter feinstes Altöl, nur leicht gebraucht.',
      cow: 'Bertha gefunden. Eine Kuh mit Termindruck. Einsatz nach Wunsch.',
      gag: 'Platten-Gag gefunden: ein Quietscheentchen für fremde Radkästen.',
      mirage: 'Fata Morgana im Karton. Keine Fragen. Einfach verschicken.',
    },
    crateFull: 'Kiste voll Krempel, aber du hast keine Hand mehr frei.',
    loot: {
      fuel: ['Im Tank des Wracks schwappt noch was. Es riecht nach 1983.', 'Restsprit gefunden. Die Vorbesitzer brauchen ihn nicht mehr.'],
      tire: ['Ein Reifen! Fast rund. Fast Luft.', 'Reifen abmontiert. Das Profil ist eher eine Erinnerung.'],
      oil: ['Öl gefunden. Oder Kaffee. Der Motor fragt nicht nach.', 'Eine Flasche Öl. Das Etikett sagt Salatdressing. Passt schon.'],
      part: ['Ersatzteil! Keiner weiß wofür. Es hält jetzt die Tür.', 'Blech abgeschraubt. Der Wüstenfuchs bekommt einen neuen Farbton.', 'Ein Kotflügel. Unfallfrei seit dem letzten Unfall.'],
      item: ['Im Handschuhfach lag etwas Gemeines. Mitgenommen.'],
      junk: ['Nur Schrott. Aber schöner Schrott. Mit Klebeband dran.', 'Ein Kassettenrekorder. Spielt nur Regen. Mitgenommen, geklebt, vergessen.'],
    },
    otherLoot: '{o} schlachtet gerade ein Wrack aus. Pietätlos.',
    radar: ['Geblitzt mit {v} km/h! Das Foto gibt es für 4,90 und deine Würde.', 'Blitz! Der Motor geht aus Scham kurz aus.', 'Radarfalle! Mitten in der Wüste. Irgendwer braucht hier dringend Geld.'],
    otherRadar: ['{o} wurde geblitzt und lächelt nicht einmal.', '{o} hat ein Porträt bei der Wüstenpolizei.'],
    radarOk: ['Sauber am Blitzer vorbei. Er wirkt enttäuscht.'],
    storm: ['SANDSTURM! Fenster zu. Die Fenster sind leider nur Deko.', 'SANDSTURM! Du siehst nichts. Dein Gegner auch nicht. Viel Spaß.'],
    stormEnd: ['Sturm vorbei. Du hast jetzt ungefähr vier Kilo Wüste im Handschuhfach.', 'Der Sand legt sich. Der Lack auch.'],
    panne: ['Panne! Haube auf, irgendwas qualmt. Halten zum Reparieren.', 'Panne! Der Keilriemen ist ausgezogen. Halten zum Reparieren.'],
    otherPanne: ['{o} hat eine Panne. Tief einatmen und hämisch vorbeifahren.'],
    repaired: ['Repariert. Mit Draht und schlechtem Gewissen.', 'Läuft wieder. Bleiben zwei Schrauben übrig, aber egal.'],
    hoseWarn: 'SCHLAUCH! {o} saugt an deinem Tank!',
    hoseHelp: 'Stoß geben oder ausweichen. 3× hupen dreht ihn um!',
    hoseStart: ['Schlauch dran. Dicht dran bleiben!'],
    hoseSnapMine: ['Schlauch gerissen. Du hast {l} Liter im Mund und im Tank.', 'Schlauch ab! {l} Liter gerettet. Schmeckt nach Sieg und Bleifrei.'],
    hoseSnapVictim: ['Abgehängt! Der Schlauch hängt jetzt an {o} wie Spaghetti.', 'Entkommen. {o} kaut noch am Schlauch.'],
    hoseEndMine: ['Fertig gesaugt: {l} Liter. Ehrliche Arbeit ist das nicht.'],
    hoseEndVictim: ['{l} Liter weg. Deine Tanknadel weint leise.'],
    hoseRevVictim: ['Rückstoß! Dein Gehupe hat den Schlauch umgedreht. Jetzt trinkst du.'],
    hoseRevMine: ['Rückstoß! {o} saugt jetzt an DIR. Schlauch sofort loswerden!'],
    oilDrop: ['Ölspur gelegt. Der Umwelt tut es leid.'],
    slip: ['Öl auf der Straße! Lenken wird gerade zu einer Empfehlung.', 'Rutsch! Die Reifen haben kurz Feierabend.'],
    slipOwn: ['Deine eigene Ölspur. Gratulation, das schaffen nur wenige.'],
    cowSent: ['Bertha ist unterwegs. Sie hat Vorfahrt und weiß es.'],
    cowWarn: ['Achtung, Kuh! Bertha überquert gleich vor dir die Straße.'],
    cowHit: ['MUUUH! Bertha steht. Du nicht mehr. Sie ist übrigens unverletzt.', 'Kuh getroffen, also eher umgekehrt. Bertha geht beleidigt weiter.'],
    otherCowHit: ['Treffer! Bertha lässt schön grüßen.'],
    gagSent: ['Quietscheentchen im Radkasten von {o} platziert.'],
    gagHit: ['Pffft! Platten? Nein, ein Quietscheentchen im Radkasten. Moment, das wackelt.', 'Dein Reifen quietscht. Es ist kein Reifen. Es ist eine Ente.'],
    mirageSent: ['Fata Morgana bei {o} zugestellt. Lieferung erfolgt ohne Unterschrift.'],
    mirageGone: ['Die Tankstelle war eine Fata Morgana. Der Tankwart winkt und löst sich auf.', 'Keine Tanke. Nur heiße Luft und Enttäuschung.'],
    mirageSign: ['SUPER GRATIS', 'ECHT JETZT', 'KEIN TRICK', 'FREIBIER & SPRIT'],
    bump: ['Blechkuss!', 'Das war mal ein Spiegel.', 'Knirsch. Das gibt eine neue Delle zur Sammlung.', 'Lackaustausch!'],

    billboards: [
      'Letzte Tanke vor der letzten Tanke', 'Hier könnte Ihre Hoffnung stehen', 'Wüste: Jetzt mit noch mehr Sand',
      'Sie fahren zu weit', 'Zurückfahren lohnt auch nicht', 'Kaktus Hannelore grüßt',
      'Kilometerstand: egal', 'Dieses Schild steht hier grundlos', 'Bockwurst in 40 km. Ungefähr.',
      'Haben Sie den Herd ausgemacht?', 'Vergaser-Selbsthilfegruppe, dienstags', 'Sand zu verkaufen, Preis VB',
      'Rost ist auch eine Farbe', 'Ihr Beifahrer ist imaginär', 'Kein Empfang seit 1994',
      'Hupen hilft. Nicht. Aber hup ruhig', 'Sparsam fahren ist was für Gewinner', 'Oase demnächst. Seit 11 Jahren.',
    ],
    holdWreck: { car: 'Halten: Wrack ausschlachten', bus: 'Halten: Bus ausschlachten', hut: 'Halten: Hütte durchsuchen' },
    holdPanne: 'Halten: reparieren',
    holdBrake: 'Erst anhalten',

    winTitle: 'Kilometer 100!',
    loseTitle: 'Zweiter. Auch schön.',
    win: [
      'Du bist da. Hier ist nichts. Aber du warst zuerst bei nichts.',
      'Gewonnen! Der Preis ist die Fahrt. Und ein Wagen, der gleich auseinanderfällt.',
    ],
    lose: [
      '{o} war schneller. Die Wüste hat es gesehen und wird es weitererzählen.',
      'Immerhin hast du die Landschaft in Ruhe genossen. Sehr lange.',
    ],
    forfeitTitle: 'Sieg durch Wegbleiben',
    forfeit: 'Dein Gegner ist in einem Funkloch verschollen. Zählt trotzdem.',
    forfeitLostTitle: 'Funkloch gewinnt',
    forfeitLost: 'Du warst zu lange weg. Die Wüste wertet das als Aufgabe.',
    other: 'Dein Gegner',
  };

  function fill(s, opts) {
    let out = s;
    if (opts) for (const k in opts) out = out.split('{' + k + '}').join(opts[k]);
    return out;
  }

  function say(key, opts) {
    return fill(pick(T[key]), opts);
  }

  return { T, say, pick, fill };
})();
