/**
 * O catálogo do questionário de música (23/11): estilos e artistas conhecidos de cada um, e para
 * que momento o estilo serve. É só o ponto de partida das perguntas — artista fora daqui entra
 * pela busca, e as sugestões saem dos parecidos (gostos.ts), não desta lista.
 */
export type Momento = "geral" | "foco" | "treino" | "noite";
export const MOMENTOS: readonly Momento[] = ["geral", "foco", "treino", "noite"];

export interface Estilo { id: string; nome: string; momentos: Momento[]; artistas: string[] }

export const ESTILOS: readonly Estilo[] = [
  { id: "trip-hop", nome: "Trip hop", momentos: ["foco", "noite"], artistas: ["Massive Attack", "Portishead", "Tricky", "Morcheeba", "Sneaker Pimps", "Hooverphonic", "Thievery Corporation", "Zero 7", "Lamb", "Archive"] },
  { id: "rock-classico", nome: "Rock clássico", momentos: ["geral"], artistas: ["Pink Floyd", "Led Zeppelin", "Queen", "The Beatles", "The Rolling Stones", "The Doors", "David Bowie", "Dire Straits", "Creedence Clearwater Revival", "Fleetwood Mac"] },
  { id: "rock-alternativo", nome: "Rock alternativo", momentos: ["geral"], artistas: ["Radiohead", "The Smashing Pumpkins", "Red Hot Chili Peppers", "Muse", "Foo Fighters", "Placebo", "Pixies", "R.E.M.", "Queens of the Stone Age", "The Cranberries"] },
  { id: "grunge", nome: "Grunge", momentos: ["treino"], artistas: ["Nirvana", "Pearl Jam", "Alice in Chains", "Soundgarden", "Stone Temple Pilots", "Mudhoney", "Hole", "Temple of the Dog"] },
  { id: "indie", nome: "Indie", momentos: ["foco", "noite"], artistas: ["Arctic Monkeys", "Tame Impala", "The Strokes", "Mac DeMarco", "The xx", "Interpol", "Phoebe Bridgers", "Cigarettes After Sex", "Arcade Fire", "Beach House"] },
  { id: "metal", nome: "Metal", momentos: ["treino"], artistas: ["Metallica", "Iron Maiden", "Black Sabbath", "Slipknot", "System of a Down", "Megadeth", "Pantera", "Sepultura", "Rammstein", "Tool"] },
  { id: "metal-moderno", nome: "Metalcore e nu metal", momentos: ["treino"], artistas: ["Linkin Park", "Korn", "Deftones", "Bring Me The Horizon", "Limp Bizkit", "Gojira", "Sleep Token", "Spiritbox", "Architects", "Papa Roach"] },
  { id: "punk", nome: "Punk e hardcore", momentos: ["treino"], artistas: ["Ramones", "The Clash", "Green Day", "The Offspring", "Dead Kennedys", "Bad Religion", "Blink-182", "Rancid", "Misfits", "Sum 41"] },
  { id: "pos-punk", nome: "Pós-punk e gótico", momentos: ["noite", "foco"], artistas: ["Joy Division", "The Cure", "The Smiths", "Siouxsie and the Banshees", "Bauhaus", "New Order", "Depeche Mode", "Molchat Doma", "Sisters of Mercy", "Echo & the Bunnymen"] },
  { id: "rap", nome: "Rap e hip hop", momentos: ["treino"], artistas: ["Kendrick Lamar", "2Pac", "The Notorious B.I.G.", "Eminem", "Nas", "Wu-Tang Clan", "Kanye West", "J. Cole", "A Tribe Called Quest", "MF DOOM"] },
  { id: "trap", nome: "Trap", momentos: ["treino"], artistas: ["Travis Scott", "Future", "Playboi Carti", "21 Savage", "Migos", "Lil Uzi Vert", "Young Thug", "Don Toliver"] },
  { id: "rap-br", nome: "Rap e trap brasileiro", momentos: ["treino"], artistas: ["Racionais MC's", "Emicida", "Criolo", "Djonga", "Matuê", "BK", "Baco Exu do Blues", "Sabotage", "Teto", "Froid"] },
  { id: "eletronica", nome: "Eletrônica e house", momentos: ["treino"], artistas: ["Daft Punk", "The Chemical Brothers", "Justice", "deadmau5", "Disclosure", "Fred again..", "Kaytranada", "The Prodigy", "Basement Jaxx", "Vintage Culture"] },
  { id: "techno", nome: "Techno e trance", momentos: ["treino", "foco"], artistas: ["Underworld", "Orbital", "Charlotte de Witte", "Amelie Lens", "Paul van Dyk", "Carl Cox", "Boris Brejcha", "Above & Beyond"] },
  { id: "idm", nome: "Ambiente e experimental", momentos: ["foco", "noite"], artistas: ["Aphex Twin", "Boards of Canada", "Brian Eno", "Burial", "Four Tet", "Jon Hopkins", "Tycho", "Autechre", "Bonobo", "Nils Frahm"] },
  { id: "drum-bass", nome: "Drum and bass", momentos: ["treino"], artistas: ["Pendulum", "Goldie", "LTJ Bukem", "Roni Size", "Chase & Status", "Sub Focus", "Netsky", "High Contrast"] },
  { id: "synthwave", nome: "Synthwave", momentos: ["foco", "noite"], artistas: ["Kavinsky", "The Midnight", "Perturbator", "Carpenter Brut", "Com Truise", "FM-84", "Timecop1983", "Gunship"] },
  { id: "lofi", nome: "Lo-fi", momentos: ["foco", "noite"], artistas: ["Nujabes", "J Dilla", "Idealism", "Jinsang", "Kupla", "Philanthrope", "Tomppabeats", "bsd.u"] },
  { id: "pop", nome: "Pop", momentos: ["geral"], artistas: ["Michael Jackson", "Madonna", "Lady Gaga", "Dua Lipa", "Taylor Swift", "Billie Eilish", "The Weeknd", "Lorde", "Harry Styles", "Lana Del Rey"] },
  { id: "rnb", nome: "R&B e neo soul", momentos: ["noite"], artistas: ["Frank Ocean", "SZA", "Erykah Badu", "D'Angelo", "Daniel Caesar", "Solange", "Sade", "Lauryn Hill", "Steve Lacy", "The Internet"] },
  { id: "soul-funk", nome: "Soul e funk americano", momentos: ["geral"], artistas: ["Stevie Wonder", "Marvin Gaye", "James Brown", "Aretha Franklin", "Earth, Wind & Fire", "Curtis Mayfield", "Parliament", "Al Green", "Bill Withers", "Amy Winehouse"] },
  { id: "jazz", nome: "Jazz", momentos: ["foco", "noite"], artistas: ["Miles Davis", "John Coltrane", "Chet Baker", "Billie Holiday", "Thelonious Monk", "Nina Simone", "Herbie Hancock", "Kamasi Washington", "BADBADNOTGOOD", "Robert Glasper"] },
  { id: "blues", nome: "Blues", momentos: ["noite"], artistas: ["B.B. King", "Muddy Waters", "Robert Johnson", "Howlin' Wolf", "Stevie Ray Vaughan", "John Lee Hooker", "Buddy Guy", "Gary Clark Jr."] },
  { id: "classica", nome: "Clássica e piano", momentos: ["foco", "noite"], artistas: ["Johann Sebastian Bach", "Ludwig van Beethoven", "Frédéric Chopin", "Claude Debussy", "Erik Satie", "Ludovico Einaudi", "Max Richter", "Antonio Vivaldi", "Philip Glass", "Ryuichi Sakamoto"] },
  { id: "trilhas", nome: "Trilhas de filme e jogo", momentos: ["foco"], artistas: ["Hans Zimmer", "John Williams", "Ennio Morricone", "Ramin Djawadi", "Joe Hisaishi", "Akira Yamaoka", "Vangelis", "Gustavo Santaolalla"] },
  { id: "mpb", nome: "MPB", momentos: ["noite"], artistas: ["Caetano Veloso", "Gilberto Gil", "Chico Buarque", "Elis Regina", "Milton Nascimento", "Gal Costa", "Djavan", "Marisa Monte", "Novos Baianos", "Tim Maia"] },
  { id: "bossa", nome: "Bossa nova", momentos: ["noite", "foco"], artistas: ["João Gilberto", "Tom Jobim", "Vinícius de Moraes", "Astrud Gilberto", "Nara Leão", "Baden Powell", "Marcos Valle", "Carlos Lyra"] },
  { id: "rock-br", nome: "Rock brasileiro", momentos: ["geral"], artistas: ["Legião Urbana", "Os Mutantes", "Titãs", "Charlie Brown Jr.", "Cazuza", "Raul Seixas", "O Rappa", "Planet Hemp", "Raimundos", "Los Hermanos"] },
  { id: "indie-br", nome: "Nova música brasileira", momentos: ["noite"], artistas: ["Tim Bernardes", "Boogarins", "Céu", "Liniker", "Terno Rei", "Silva", "Tulipa Ruiz", "Rubel", "Marina Sena", "Ana Frango Elétrico"] },
  { id: "samba", nome: "Samba e pagode", momentos: ["geral"], artistas: ["Cartola", "Zeca Pagodinho", "Beth Carvalho", "Paulinho da Viola", "Fundo de Quintal", "Jorge Aragão", "Clara Nunes", "Jorge Ben Jor", "Exaltasamba", "Revelação"] },
  { id: "funk-br", nome: "Funk brasileiro", momentos: ["treino"], artistas: ["Anitta", "Ludmilla", "MC Kevin o Chris", "MC Hariel", "MC Ryan SP", "DJ Arana", "MC Cabelinho", "Kevinho"] },
  { id: "sertanejo", nome: "Sertanejo", momentos: ["geral"], artistas: ["Chitãozinho & Xororó", "Marília Mendonça", "Jorge & Mateus", "Henrique & Juliano", "Zezé Di Camargo & Luciano", "Milionário & José Rico", "Gusttavo Lima", "Ana Castela"] },
  { id: "nordeste", nome: "Forró, baião e manguebeat", momentos: ["geral"], artistas: ["Luiz Gonzaga", "Dominguinhos", "Alceu Valença", "Zé Ramalho", "Chico Science", "Nação Zumbi", "Geraldo Azevedo", "Mestre Ambrósio", "João Gomes", "Falamansa"] },
  { id: "reggae", nome: "Reggae e dub", momentos: ["noite"], artistas: ["Bob Marley & The Wailers", "Peter Tosh", "Burning Spear", "Lee \"Scratch\" Perry", "Jimmy Cliff", "Natiruts", "Damian Marley", "Steel Pulse", "Chronixx", "Edson Gomes"] },
  { id: "latina", nome: "Latina e reggaeton", momentos: ["treino"], artistas: ["Bad Bunny", "Rosalía", "Karol G", "J Balvin", "Daddy Yankee", "Residente", "Natalia Lafourcade", "Soda Stereo"] },
  { id: "folk", nome: "Folk e acústico", momentos: ["noite", "foco"], artistas: ["Bob Dylan", "Nick Drake", "Simon & Garfunkel", "Bon Iver", "Sufjan Stevens", "Joni Mitchell", "Iron & Wine", "José González", "Fleet Foxes", "Leonard Cohen"] },
  { id: "country", nome: "Country", momentos: ["geral"], artistas: ["Johnny Cash", "Dolly Parton", "Willie Nelson", "Chris Stapleton", "Zach Bryan", "Hank Williams", "Kacey Musgraves", "Luke Combs"] },
  { id: "shoegaze", nome: "Shoegaze e dream pop", momentos: ["noite", "foco"], artistas: ["My Bloody Valentine", "Slowdive", "Cocteau Twins", "Ride", "Mazzy Star", "Alvvays", "DIIV", "Whirr"] },
  { id: "pos-rock", nome: "Pós-rock e instrumental", momentos: ["foco"], artistas: ["Explosions in the Sky", "Mogwai", "Sigur Rós", "Godspeed You! Black Emperor", "God Is an Astronaut", "Tortoise", "This Will Destroy You", "Khruangbin"] },
  { id: "kpop", nome: "K-pop e J-pop", momentos: ["treino"], artistas: ["BTS", "BLACKPINK", "NewJeans", "Stray Kids", "YOASOBI", "Kenshi Yonezu", "Mariya Takeuchi", "Tatsuro Yamashita"] },
  { id: "afro", nome: "Afrobeat e África", momentos: ["geral"], artistas: ["Fela Kuti", "Burna Boy", "Wizkid", "Tems", "Cesária Évora", "Ali Farka Touré", "Tinariwen", "Mulatu Astatke"] },
];
