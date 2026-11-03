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
    forfeit: 'Dein Gegner ist in einem Funkloch verschollen. Sieg durch Wegbleiben.',
    other: 'Dein Gegner',
  };

  function say(key, opts) {
    let s = pick(T[key]);
    if (opts && opts.o) s = s.replace('{o}', opts.o);
    return s;
  }

  return { T, say, pick };
})();
