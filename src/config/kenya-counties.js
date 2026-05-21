module.exports = {
  regions: [
    {
      name: 'Nairobi & Central',
      counties: [
        { name: 'Nairobi',    towns: ['Nairobi CBD','Westlands','Eastleigh','Karen','Githurai'] },
        { name: 'Kiambu',     towns: ['Thika','Ruiru','Kikuyu','Limuru','Kiambu Town'] },
        { name: "Murang'a",   towns: ["Murang'a Town",'Kangema','Maragua','Kandara'] },
        { name: 'Kirinyaga',  towns: ['Kerugoya','Kutus','Mwea','Kagio'] },
        { name: 'Nyeri',      towns: ['Nyeri Town','Karatina','Othaya','Mukurweini','Tetu'] },
      ],
    },
    {
      name: 'Mount Kenya & Eastern',
      counties: [
        { name: 'Meru',           towns: ['Meru Town','Nkubu','Timau','Maua','Mikinduri'] },
        { name: 'Tharaka Nithi',  towns: ['Chuka','Maara','Tharaka','Kiburia','Muthambi','Gatunga'] },
        { name: 'Embu',           towns: ['Embu Town','Runyenjes','Siakago','Manyatta'] },
        { name: 'Kitui',          towns: ['Kitui Town','Mwingi','Mutomo','Kabati'] },
        { name: 'Machakos',       towns: ['Machakos Town','Athi River','Kangundo','Matuu'] },
        { name: 'Makueni',        towns: ['Wote','Sultan Hamud','Emali','Makindu'] },
        { name: 'Isiolo',         towns: ['Isiolo Town','Merti','Garbatulla'] },
        { name: 'Marsabit',       towns: ['Marsabit Town','Moyale','Sololo','Laisamis'] },
      ],
    },
    {
      name: 'Rift Valley',
      counties: [
        { name: 'Nakuru',           towns: ['Nakuru Town','Naivasha','Gilgil','Molo','Njoro'] },
        { name: 'Nandi',            towns: ['Kapsabet','Nandi Hills','Mosoriot'] },
        { name: 'Uasin Gishu',      towns: ['Eldoret','Turbo','Moiben','Ziwa'] },
        { name: 'Trans Nzoia',      towns: ['Kitale','Kiminini','Endebess'] },
        { name: 'Elgeyo Marakwet',  towns: ['Iten','Kapsowar','Chepkorio'] },
        { name: 'West Pokot',       towns: ['Kapenguria','Makutano','Sigor'] },
        { name: 'Samburu',          towns: ["Maralal","Archer's Post",'Wamba'] },
        { name: 'Laikipia',         towns: ['Nanyuki','Rumuruti','Nyahururu'] },
        { name: 'Baringo',          towns: ['Kabarnet','Eldama Ravine','Marigat','Mogotio'] },
        { name: 'Bomet',            towns: ['Bomet Town','Sotik','Longisa','Chesoen'] },
        { name: 'Kericho',          towns: ['Kericho Town','Litein','Londiani','Fort Ternan'] },
        { name: 'Narok',            towns: ['Narok Town','Kilgoris','Narosura','Suswa'] },
        { name: 'Kajiado',          towns: ['Kajiado Town','Ngong','Ongata Rongai','Kitengela','Namanga'] },
        { name: 'Turkana',          towns: ['Lodwar','Kakuma','Lokichoggio','Kalokol'] },
      ],
    },
    {
      name: 'Nyanza & Western',
      counties: [
        { name: 'Kisumu',    towns: ['Kisumu City','Ahero','Muhoroni','Maseno'] },
        { name: 'Siaya',     towns: ['Siaya Town','Ugunja','Ukwala','Bondo'] },
        { name: 'Kisii',     towns: ['Kisii Town','Ogembo','Keroka','Nyamache'] },
        { name: 'Nyamira',   towns: ['Nyamira Town','Keroka','Nyansiongo'] },
        { name: 'Homa Bay',  towns: ['Homa Bay Town','Kendu Bay','Oyugis','Mbita'] },
        { name: 'Migori',    towns: ['Migori Town','Rongo','Awendo','Kehancha'] },
        { name: 'Kakamega',  towns: ['Kakamega Town','Mumias','Butere','Malava'] },
        { name: 'Bungoma',   towns: ['Bungoma Town','Webuye','Chwele','Malakisi'] },
        { name: 'Busia',     towns: ['Busia Town','Malaba','Port Victoria','Nambale'] },
        { name: 'Vihiga',    towns: ['Vihiga Town','Mbale','Hamisi','Luanda'] },
      ],
    },
    {
      name: 'Coast',
      counties: [
        { name: 'Mombasa',      towns: ['Mombasa CBD','Nyali','Bamburi','Likoni','Changamwe'] },
        { name: 'Kilifi',       towns: ['Kilifi Town','Malindi','Watamu','Mariakani'] },
        { name: 'Kwale',        towns: ['Kwale Town','Ukunda','Msambweni','Lungalunga'] },
        { name: 'Taita Taveta', towns: ['Voi','Wundanyi','Mwatate','Taveta'] },
        { name: 'Tana River',   towns: ['Hola','Garsen','Bura'] },
        { name: 'Lamu',         towns: ['Lamu Town','Mpeketoni','Hindi'] },
      ],
    },
    {
      name: 'North Eastern',
      counties: [
        { name: 'Garissa', towns: ['Garissa Town','Dadaab','Liboi','Hulugho'] },
        { name: 'Wajir',   towns: ['Wajir Town','Habaswein','Bute','Eldas'] },
        { name: 'Mandera', towns: ['Mandera Town','Rhamu','Takaba','Elwak'] },
      ],
    },
  ],

  getAllCounties() {
    return this.regions.flatMap(r => r.counties.map(c => c.name));
  },

  getTowns(countyName) {
    for (const region of this.regions) {
      const county = region.counties.find(c => c.name === countyName);
      if (county) return county.towns;
    }
    return [];
  },

  getRegion(countyName) {
    for (const region of this.regions) {
      if (region.counties.find(c => c.name === countyName)) return region.name;
    }
    return null;
  },
};
