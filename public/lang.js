/* 56 — English / Malayalam. English is the source text everywhere; T('English text', args...) returns the
   Malayalam for it when the player has switched (remembered in the browser, or ?lang=ml in the link).
   Sentences are written so that player and team names never need a Malayalam case ending.
   Server text (errors, system chat, the hand log) arrives in English and is matched here by pattern. */
(() => {
  'use strict';
  const ML = {
    // ---- lobby
    'Two teams, two packs, 56 points. Type your name, walk into the 6-player or 8-player table, and pick a seat. Bots fill any empty seats.':
      'രണ്ട് ടീം, രണ്ട് പെട്ടി ചീട്ട്, 56 പോയിന്റ്. പേര് ടൈപ്പ് ചെയ്ത്, 6 പേരുടെയോ 8 പേരുടെയോ ടേബിളിൽ കയറി ഒരു സീറ്റ് എടുക്കൂ. ഒഴിഞ്ഞ സീറ്റുകളിൽ ബോട്ടുകൾ കളിക്കും.',
    'Your name': 'നിങ്ങളുടെ പേര്',
    '(required)': '(നിർബന്ധം)',
    'e.g. BGK': 'ഉദാ. BGK',
    'Want to try 56 first? Start a private table and play against the bots, or bring your own friends: send them play56.in and the table code.':
      '56 ആദ്യം ഒന്ന് പരീക്ഷിക്കണോ? ഒരു പ്രൈവറ്റ് ടേബിൾ തുടങ്ങി ബോട്ടുകളോട് കളിക്കൂ, അല്ലെങ്കിൽ കൂട്ടുകാരെ വിളിക്കൂ: അവർക്ക് play56.in-ഉം ടേബിൾ കോഡും അയച്ചുകൊടുക്കൂ.',
    'Start a private table': 'പ്രൈവറ്റ് ടേബിൾ തുടങ്ങൂ',
    '6 players': '6 പേർ',
    '8 players': '8 പേർ',
    'Start a new table': 'പുതിയ ടേബിൾ തുടങ്ങൂ',
    'Have a code?': 'കോഡ് ഉണ്ടോ?',
    'Join table': 'ടേബിളിൽ ചേരൂ',
    'Public tables': 'പൊതു ടേബിളുകൾ',
    'Open to everyone. Walk in and pick a seat.': 'എല്ലാവർക്കും കയറാം. വന്ന് ഒരു സീറ്റ് എടുക്കൂ.',
    '6-player table': '6 പേരുടെ ടേബിൾ',
    '8-player table': '8 പേരുടെ ടേബിൾ',
    '3 vs 3 · 8 cards each': '3 vs 3 · ഓരോരുത്തർക്കും 8 ചീട്ട്',
    '4 vs 4 · 8 cards each, with 7s and 8s': '4 vs 4 · ഓരോരുത്തർക്കും 8 ചീട്ട്, 7-ഉം 8-ഉം ചേർത്ത്',
    'Reset table for a new game': 'പുതിയ കളിക്കായി ടേബിൾ റീസെറ്റ് ചെയ്യൂ',
    'How 56 is played here': 'ഇവിടെ 56 കളിക്കുന്ന വിധം',
    'LIVE': 'ലൈവ്',
    '{0} seated': '{0} പേർ ഇരിപ്പുണ്ട്',
    ', {0} watching': ', {0} പേർ കാണുന്നു',
    ', playing': ', കളി നടക്കുന്നു',
    'empty, old game waiting': 'ആളില്ല, പഴയ കളി ബാക്കിയുണ്ട്',
    'empty': 'ആളില്ല',
    'Which team do you want to sit on? If it is full you get a seat on the other team.': 'ഏത് ടീമിൽ ഇരിക്കണം? അത് നിറഞ്ഞാൽ മറ്റേ ടീമിൽ സീറ്റ് കിട്ടും.',
    'Team A': 'ടീം A',
    'Team B': 'ടീം B',
    'Any team': 'ഏതു ടീമും',
    'Cancel': 'വേണ്ട',
    'Please type your name first.': 'ആദ്യം നിങ്ങളുടെ പേര് ടൈപ്പ് ചെയ്യൂ.',
    'New {0}-player table': '{0} പേരുടെ പുതിയ ടേബിൾ',
    '{0}-player table': '{0} പേരുടെ ടേബിൾ',
    'Enter the table code.': 'ടേബിൾ കോഡ് ടൈപ്പ് ചെയ്യൂ.',
    'Table {0}': 'ടേബിൾ {0}',
    // ---- top bar and table panel
    'Copy invite link': 'ക്ഷണിക്കാനുള്ള ലിങ്ക് കോപ്പി ചെയ്യൂ',
    'Invite link copied': 'ലിങ്ക് കോപ്പി ചെയ്തു',
    'Table ': 'ടേബിൾ ',
    'Rename the teams': 'ടീമുകളുടെ പേര് മാറ്റൂ',
    'Watching': 'കാണുന്നവർ',
    '{0} watching': '{0} പേർ കാണുന്നു',
    'Watching: {0}': 'കാണുന്നവർ: {0}',
    'Full screen': 'ഫുൾ സ്ക്രീൻ',
    'Exit full screen': 'ഫുൾ സ്ക്രീൻ വിടൂ',
    'Full screen is not available in this browser.': 'ഈ ബ്രൗസറിൽ ഫുൾ സ്ക്രീൻ കിട്ടില്ല.',
    'Show chat and log': 'ചാറ്റും കളിവിവരവും കാണിക്കൂ',
    'Chat': 'ചാറ്റ്',
    'Close chat': 'ചാറ്റ് അടയ്ക്കൂ',
    '✕ Close': '✕ അടയ്ക്കൂ',
    'Close': 'അടയ്ക്കൂ',
    'Last trick': 'കഴിഞ്ഞ പിടി',
    'Reset chips': 'മേശ റീസെറ്റ്',
    'Host only: both teams back to 12 chips': 'ഹോസ്റ്റിന് മാത്രം: രണ്ട് ടീമിനും വീണ്ടും 12 മേശ',
    'Show the hands': 'കൈകൾ കാണിക്കൂ',
    "Everyone's cards as dealt (after the hand)": 'എല്ലാവർക്കും കിട്ടിയ ചീട്ടുകൾ (കളി കഴിഞ്ഞ ശേഷം)',
    'Concede': 'വിട്ടുകൊടുക്കൂ',
    'Give up this hand: your team pays the chips as a loss': 'ഈ കളി വിട്ടുകൊടുക്കാം: തോറ്റതുപോലെ നിങ്ങളുടെ ടീം മേശ കൊടുക്കണം',
    'Switch between the two-colour and four-colour deck (diamonds blue, clubs green)': 'രണ്ടു നിറം / നാലു നിറം ചീട്ട് മാറ്റാം (ഡയമണ്ട് നീല, ക്ലാവർ പച്ച)',
    '4-colour deck': '4 നിറം ചീട്ട്',
    '2-colour deck': '2 നിറം ചീട്ട്',
    'Leave table': 'ടേബിൾ വിടൂ',
    'Say something': 'എന്തെങ്കിലും പറയൂ',
    'Send': 'അയയ്ക്കൂ',
    'Connection lost. Reconnecting…': 'കണക്ഷൻ പോയി. വീണ്ടും കണക്ട് ചെയ്യുന്നു…',
    '● Your turn · 56': '● നിങ്ങളുടെ ഊഴം · 56',
    '56 · Kerala card table': '56 · കേരള ചീട്ടുകളി',
    'Your cards': 'നിങ്ങളുടെ ചീട്ടുകൾ',
    // ---- suits and calls
    'Spade': 'സ്പേഡ്', 'Heart': 'ആഡ്യൻ', 'Diamond': 'ഡയമണ്ട്', 'Club': 'ക്ലാവർ',
    'Spades': 'സ്പേഡ്', 'Hearts': 'ആഡ്യൻ', 'Diamonds': 'ഡയമണ്ട്', 'Clubs': 'ക്ലാവർ',
    'No trump': 'നോ ട്രംപ്',
    'Pass': 'പാസ്',
    'Double': 'ഡബിൾ',
    'Redouble': 'റീഡബിൾ',
    'Doubled': 'ഡബിൾ',
    'Redoubled': 'റീഡബിൾ',
    'Change to ': 'മാറ്റി: ',
    'Plus {0} ({1})': 'പ്ലസ് {0} ({1})',
    'Plus {0}': 'പ്ലസ് {0}',
    '{0} NS (no {1})': '{0} എൻ.എസ് ({1} ഇല്ല)',
    '{0} of {1}': '{1} {0}',
    // ---- bid panel
    'Your bid': 'നിങ്ങളുടെ വിളി',
    'Bid higher': 'കൂട്ടി വിളിക്കൂ',
    'Lower bid': 'വിളി കുറയ്ക്കൂ',
    'Raise bid': 'വിളി കൂട്ടൂ',
    'Current bid {0} by {1}': 'ഇപ്പോഴത്തെ വിളി {0} · {1}',
    'You open the bidding': 'നിങ്ങളാണ് ആദ്യം വിളിക്കേണ്ടത്',
    'Bid {0} {1}': '{0} {1} വിളിക്കൂ',
    ' (suit first: you hold no Jack of it)': ' (ചിഹ്നം ആദ്യം: ഇതിന്റെ ജാക്ക് നിങ്ങളുടെ കൈയിലില്ല)',
    'Your own suit needs {0} or more': 'സ്വന്തം ചിഹ്നത്തിൽ {0} എങ്കിലും വിളിക്കണം',
    'You already raised this suit': 'ഈ ചിഹ്നം നിങ്ങൾ ഒരിക്കൽ ഉയർത്തിക്കഴിഞ്ഞു',
    'You hold no {0}': 'നിങ്ങളുടെ കൈയിൽ {0} ഇല്ല',
    'Bid {0} {1}: ': '{0} {1} വിളി: ',
    'Open {0} {1}: ': 'കൈവിളി {0} {1}: ',
    'I hold {0} of {1}': 'എന്റെ കൈയിൽ {1} {0} ഉണ്ട്',
    'this suit': 'ഈ ചിഹ്നത്തിന്റെ',
    ' and ': ', ',
    ' and nothing else in it': ' (അതിൽ വേറെ ചീട്ടില്ല)',
    '{0} NS · no {1}': '{0} എൻ.എസ് · {1} ഇല്ല',
    'No trump; tells the table you hold no {0}': 'നോ ട്രംപ്; നിങ്ങളുടെ കൈയിൽ {0} ഇല്ലെന്ന് അറിയിക്കുന്നു',
    'The first bidder must open with 28 or more': 'കൈവിളിക്കാരൻ 28 എങ്കിലും വിളിക്കണം',
    // ---- keep / raise / change window
    'Raise the bid': 'വിളി ഉയർത്തൂ',
    'Raise the bid?': 'വിളി ഉയർത്തണോ?',
    'Keep it': 'ഇതു മതി',
    'Or change suit at': 'അല്ലെങ്കിൽ ചിഹ്നം മാറ്റി വിളിക്കൂ:',
    'Your {0} was doubled and everyone passed — keep it (chips ×2), redouble (×4)': 'നിങ്ങളുടെ {0} ഡബിൾ ആയി, എല്ലാവരും പാസ് — വയ്ക്കാം (മേശ ×2), റീഡബിൾ (×4)',
    ', raise it': ', ഉയർത്താം',
    ', or change to another suit (the double is cancelled and bidding reopens)': ', അല്ലെങ്കിൽ ചിഹ്നം മാറ്റാം (ഡബിൾ റദ്ദാകും, വിളി വീണ്ടും തുടങ്ങും)',
    'You won the bid at {0} — keep it, or convert to a higher tier.': 'വിളി നിങ്ങൾക്ക് കിട്ടി: {0} — ഇതു മതി എന്നു വയ്ക്കാം, അല്ലെങ്കിൽ ഉയർന്ന നിലയിലേക്ക് കൂട്ടാം.',
    'Change to {0} {1}': '{0} {1} ആക്കി മാറ്റൂ',
    'Raise your contract to {0} {1}: bigger stake, more points needed': 'വിളി {0} {1} ആയി ഉയർത്തൂ: കൂടുതൽ മേശ, കൂടുതൽ പോയിന്റ് വേണം',
    // ---- seats
    'Seat {0}': 'സീറ്റ് {0}',
    'takes {0} pts': '{0} പോയിന്റ് പിടിച്ചു',
    'takes the trick': 'പിടി എടുത്തു',
    'Open seat': 'ഒഴിഞ്ഞ സീറ്റ്',
    'Sit here': 'ഇവിടെ ഇരിക്കൂ',
    'Add bot': 'ബോട്ട് ചേർക്കൂ',
    'Change': 'മാറ്റൂ',
    'Any bot': 'ഏതെങ്കിലും ബോട്ട്',
    'chosen at the deal': 'കളി തുടങ്ങുമ്പോൾ തീരുമാനിക്കും',
    'Choose a bot for this seat': 'ഈ സീറ്റിലേക്ക് ഒരു ബോട്ടിനെ തിരഞ്ഞെടുക്കൂ',
    'The table is set to {0}: every bot plays that way, whatever its own character.': 'ടേബിൾ {0} രീതിയിലാണ്: സ്വന്തം സ്വഭാവം എന്തായാലും എല്ലാ ബോട്ടും അങ്ങനെ കളിക്കും.',
    'Meet the bots': 'ബോട്ടുകളെ പരിചയപ്പെടാം',
    'The host of a table can choose the bot for each seat before the first deal.': 'ആദ്യ കളിക്കു മുമ്പ് ഓരോ സീറ്റിലേക്കും ബോട്ടിനെ ഹോസ്റ്റിന് തിരഞ്ഞെടുക്കാം.',
    'Bold': 'ധൈര്യം',
    'Steady': 'മിതം',
    'Careful': 'കരുതൽ',
    'Bids often, fights for the contract and jumps to 40 when strong.': 'കൂടെക്കൂടെ വിളിക്കും, വിളി പിടിക്കാൻ പൊരുതും, കൈ നല്ലതെങ്കിൽ 40-ലേക്ക് ചാടും.',
    'Bids what the hand is worth and jumps only when it is sure.': 'കൈയ്ക്ക് ഒത്ത വിളി മാത്രം; ഉറപ്പുണ്ടെങ്കിലേ ചാടൂ.',
    'Bids rarely and stays low, but usually makes what it bids.': 'അപൂർവമായേ വിളിക്കൂ, താഴ്ന്ന വിളി; പക്ഷേ വിളിച്ചത് മിക്കവാറും നേടും.',
    'Human-trained': 'ആളുകളിൽ നിന്ന് പഠിച്ചത്',
    'Neural net': 'ന്യൂറൽ നെറ്റ്',
    'Bidding learned from human play.': 'വിളി പഠിച്ചത് ആളുകളുടെ കളി കണ്ട്.',
    'Plays its cards with a neural network that learned from millions of searched positions.': 'ചീട്ട് ഇറക്കുന്നത് ലക്ഷക്കണക്കിന് കളിനിലകൾ തിരഞ്ഞു പഠിച്ച ഒരു ന്യൂറൽ നെറ്റ്‌വർക്ക്.',
    'bot': 'ബോട്ട്',
    'away': 'പുറത്ത്',
    'deals': 'വിളമ്പി',
    'Dealt this hand': 'ഈ കളിയിൽ ചീട്ട് വിളമ്പിയ ആൾ',
    'opens': 'കൈവിളി',
    'Opens the bidding and leads the first trick': 'ആദ്യം വിളിക്കും, ആദ്യ പിടി ഇറക്കും',
    'Move here; a bot takes your current seat': 'ഇങ്ങോട്ട് മാറാം; നിങ്ങളുടെ ഇപ്പോഴത്തെ സീറ്റിൽ ബോട്ട് ഇരിക്കും',
    'Play this seat': 'ഈ സീറ്റിൽ കളിക്കൂ',
    'Move here': 'ഇങ്ങോട്ട് മാറൂ',
    'Take seat': 'സീറ്റ് എടുക്കൂ',
    'Remove': 'എടുത്തുമാറ്റൂ',
    'Replace with bot': 'പകരം ബോട്ട്',
    'Cards in hand': 'കൈയിലെ ചീട്ടുകൾ',
    'Bids with numbers tuned on human play': 'ആളുകളുടെ കളി നോക്കി പഠിച്ച വിളി',
    'Kunukku: lost the last match. Comes off when this player bids and makes a contract, or when the team wins the match.': 'കുണുക്ക്: കഴിഞ്ഞ മത്സരം തോറ്റു. ഈ കളിക്കാരൻ വിളിച്ച് ജയിച്ചാലോ ടീം മത്സരം ജയിച്ചാലോ ഊരാം.',
    // ---- scores and the mat
    '{0} chips': '{0} മേശ',
    '{0} chip': '{0} മേശ',
    '{0} pts': '{0} പോയിന്റ്',
    '{0} points': '{0} പോയിന്റ്',
    '<b>{0}</b> needs {1}{2} for {3}': '<b>{0}</b> · {3}: {1}{2} വേണം',
    'wins {0}, loses {1} chips': 'ജയിച്ചാൽ {0}, തോറ്റാൽ {1} മേശ',
    'Trump {0}': 'തുറുപ്പ് {0}',
    'Lead {0}': 'ഇറക്കിയത് {0}',
    '{0} of {1} seated. Send the code to friends; empty seats become bots when the host deals.': '{1}-ൽ {0} പേർ ഇരുന്നു. കോഡ് കൂട്ടുകാർക്ക് അയയ്ക്കൂ; ഹോസ്റ്റ് ചീട്ട് വിളമ്പുമ്പോൾ ഒഴിഞ്ഞ സീറ്റുകളിൽ ബോട്ടുകൾ വരും.',
    '{0} of {1} seated; empty seats become bots when the host deals.': '{1}-ൽ {0} പേർ ഇരുന്നു; ഹോസ്റ്റ് ചീട്ട് വിളമ്പുമ്പോൾ ഒഴിഞ്ഞ സീറ്റുകളിൽ ബോട്ടുകൾ വരും.',
    'Deal the first hand': 'ആദ്യ കളി വിളമ്പൂ',
    'Waiting for the host to deal.': 'ഹോസ്റ്റ് ചീട്ട് വിളമ്പാൻ കാത്തിരിക്കുന്നു.',
    'Your call': 'നിങ്ങളുടെ വിളി',
    '{0} to call': 'വിളിക്കേണ്ടത്: {0}',
    'Hand {0}': 'കളി {0}',
    'You won the bid (doubled) — keep it, raise, or change suit': 'വിളി നിങ്ങൾക്ക് (ഡബിൾ) — വയ്ക്കാം, ഉയർത്താം, അല്ലെങ്കിൽ ചിഹ്നം മാറ്റാം',
    'You won the bid — keep it or raise to a higher tier': 'വിളി നിങ്ങൾക്ക് — ഇതു മതിയോ, അതോ ഉയർന്ന നിലയിലേക്ക് കൂട്ടണോ',
    '{0} won the bid (doubled) — deciding whether to keep, raise or change suit': 'വിളി കിട്ടിയത് {0} (ഡബിൾ) — വയ്ക്കണോ, ഉയർത്തണോ, ചിഹ്നം മാറ്റണോ എന്ന് ആലോചിക്കുന്നു',
    '{0} won the bid — deciding whether to raise': 'വിളി കിട്ടിയത് {0} — ഉയർത്തണോ എന്ന് ആലോചിക്കുന്നു',
    'Trick {0} of {1} · your lead': 'പിടി {0} / {1} · നിങ്ങൾ ഇറക്കണം',
    'Trick {0} of {1} · {2} leads': 'പിടി {0} / {1} · ഇറക്കേണ്ടത്: {2}',
    '{0} wins': '{0} ജയിച്ചു',
    'Start a new match': 'പുതിയ മത്സരം തുടങ്ങൂ',
    'The host can start a new match.': 'ഹോസ്റ്റിന് പുതിയ മത്സരം തുടങ്ങാം.',
    'Hand void: {0} holds no {1}': 'കളി അസാധു: {0} · {1} ഇല്ല',
    '{0} conceded {1}': '{0} വിട്ടുകൊടുത്തു · {1}',
    '{0} made {1}': '{0} ജയിച്ചു · {1}',
    '{0} went down on {1}': '{0} തോറ്റു · {1}',
    'Use "Last trick", "Show the hands" and the log on the right to review the hand.': 'കളി വീണ്ടും നോക്കാൻ "കഴിഞ്ഞ പിടി", "കൈകൾ കാണിക്കൂ", വലതുവശത്തെ കളിവിവരം എന്നിവ ഉപയോഗിക്കാം.',
    'Show the initial hands': 'കിട്ടിയ കൈകൾ കാണിക്കൂ',
    'Next hand': 'അടുത്ത കളി',
    'The host deals the next hand.': 'അടുത്ത കളി ഹോസ്റ്റ് വിളമ്പും.',
    'Bots: ': 'ബോട്ടുകൾ: ',
    'mixed': 'പലവിധം', 'defensive': 'കരുതൽ', 'medium': 'മിതം', 'aggressive': 'ധൈര്യം',
    'Mixed: each bot keeps its own temperament (hover a bot for it)': 'പലവിധം: ഓരോ ബോട്ടും സ്വന്തം രീതിയിൽ കളിക്കും',
    'Defensive: bid low, rarely raise or go for levels': 'കരുതൽ: കുറച്ചേ വിളിക്കൂ, അപൂർവമായേ കൂട്ടി വിളിക്കൂ',
    'Medium: balanced (default)': 'മിതം: അധികം കൂട്ടാതെ, കുറയ്ക്കാതെ (സാധാരണ)',
    'Aggressive: bid up, support partner, go for 40 / 48 / 56': 'ധൈര്യം: കൂട്ടി വിളിക്കും, പങ്കാളിയുടെ വിളിക്ക് കൂട്ടു വിളിക്കും, 40 / 48 / 56 നോക്കും',
    // ---- pop-ups
    'No trick has been completed yet.': 'ഒരു പിടിയും ഇതുവരെ കഴിഞ്ഞിട്ടില്ല.',
    '{0} won it for {1} ({2} pts).': '{0} പിടിച്ചു · {1} ({2} പോയിന്റ്).',
    'Sit down first to rename the teams.': 'ടീമിന്റെ പേര് മാറ്റാൻ ആദ്യം ഒരു സീറ്റിൽ ഇരിക്കൂ.',
    'Team names': 'ടീമുകളുടെ പേര്',
    'Shown to everyone at this table.': 'ഈ ടേബിളിലെ എല്ലാവർക്കും കാണാം.',
    'Save': 'സേവ് ചെയ്യൂ',
    'Hands are shown only after the hand is over.': 'കളി കഴിഞ്ഞാലേ കൈകൾ കാണിക്കൂ.',
    'Hand {0}: the deal': 'കളി {0}: വിളമ്പിയ ചീട്ടുകൾ',
    '{0} played {1}. {2} dealt.': 'വിളി: {0}, {1}. വിളമ്പിയത്: {2}.',
    'Concede this hand?': 'ഈ കളി വിട്ടുകൊടുക്കണോ?',
    '{0} gives up and pays {1} to {2}, as if the bid had gone down.': '{0} കളി വിട്ടുകൊടുക്കുന്നു. വിളി തോറ്റതുപോലെ {1} കൊടുക്കണം ({2} വാങ്ങും).',
    '{0} gives up and pays {1} to {2}, as if the bid had been made.': '{0} കളി വിട്ടുകൊടുക്കുന്നു. വിളി ജയിച്ചതുപോലെ {1} കൊടുക്കണം ({2} വാങ്ങും).',
    'A teammate has to agree before the hand ends.': 'കളി തീരാൻ ടീമിലെ ഒരാൾ സമ്മതിക്കണം.',
    'Play on': 'കളി തുടരാം',
    'Waiting for a teammate': 'ടീമിലുള്ളവരുടെ മറുപടിക്കായി കാത്തിരിക്കുന്നു',
    'Your concede request is with the rest of {0}. The hand ends when one of them agrees.': 'വിട്ടുകൊടുക്കാമോ എന്ന് ടീമിലെ ({0}) മറ്റുള്ളവരോട് ചോദിച്ചിട്ടുണ്ട്. ഒരാൾ സമ്മതിച്ചാൽ കളി തീരും.',
    'Withdraw': 'പിൻവലിക്കൂ',
    'Concede the hand?': 'കളി വിട്ടുകൊടുക്കണോ?',
    '<b>{0}</b> wants {1} to give up this hand and pay {2} to {3}.': '<b>{0}</b> ഈ കളി വിട്ടുകൊടുക്കാമെന്ന് പറയുന്നു. {1} {2} കൊടുക്കണം ({3} വാങ്ങും).',
    'Agree': 'സമ്മതം',
    'Reset chips?': 'മേശ റീസെറ്റ് ചെയ്യണോ?',
    'Both teams go back to 12 chips. The current hand continues.': 'രണ്ട് ടീമിനും വീണ്ടും 12 മേശ. ഇപ്പോഴത്തെ കളി തുടരും.',
    'Reset': 'റീസെറ്റ്',
    'Hand void': 'കളി അസാധു',
    '{0} bid {1}, but {2} holds no {3}. No chips change; the deal passes to the next player.': '{0} വിളിച്ചത് {1}; പക്ഷേ {2}: കൈയിൽ {3} ഇല്ല. മേശ മാറില്ല; അടുത്തയാൾ ചീട്ട് വിളമ്പും.',
    '{0} conceded': '{0} വിട്ടുകൊടുത്തു',
    '{0} made it': '{0} ജയിച്ചു',
    '{0} went down': '{0} തോറ്റു',
    '{0} pays {1} to {2}.': '{0} {1} കൊടുക്കും; വാങ്ങുന്നത് {2}.',
    '{0} bid {1}{2}. ': '{0} വിളിച്ചത് {1}{2}. ',
    'Stopped after trick {0}: target reached.': 'പിടി {0} കഴിഞ്ഞ് നിർത്തി: ലക്ഷ്യം എത്തി.',
    'Stopped after trick {0}: target out of reach.': 'പിടി {0} കഴിഞ്ഞ് നിർത്തി: ലക്ഷ്യം ഇനി എത്തില്ല.',
    '{0} wins the match.': '{0} മത്സരം ജയിച്ചു.',
    '{0} wears the kunukku.': '{0} കുണുക്ക് അണിയുന്നു.',
    'Bid and win the first hand of the next match and the whole team takes it off. After that, each player sheds their own by bidding and making a contract.':
      'അടുത്ത മത്സരത്തിലെ ആദ്യ കളി വിളിച്ച് ജയിച്ചാൽ ടീം മുഴുവൻ കുണുക്ക് ഊരാം. അതു കഴിഞ്ഞാൽ ഓരോരുത്തരും സ്വയം വിളിച്ച് ജയിച്ച് സ്വന്തം കുണുക്ക് ഊരണം.',
    // ---- trophy and kunukku screens
    'Kunukku kayari!': 'കുണുക്ക് കയറി!',
    'wears the kunukku': 'കുണുക്ക് അണിയുന്നു',
    'Champions': 'ചാമ്പ്യന്മാർ',
    'Hand won': 'കളി ജയിച്ചു',
    'tap to continue': 'തുടരാൻ തൊടൂ',
    'Clean sweep!': 'തൂത്തുവാരി!',
    'All 56 points!': '56 പോയിന്റും സ്വന്തം!',
    '{0} did not get a single point': '{0}-ന് ഒരു പോയിന്റ് പോലും കിട്ടിയില്ല',
    'Team captain. The team chips are kept here': 'ടീം ക്യാപ്റ്റൻ. ടീമിന്റെ മേശ ഇവിടെ',
    'captain seat': 'ക്യാപ്റ്റൻ സീറ്റ്',
    'wins the match': 'മത്സരം ജയിച്ചു',
    'takes {0} as {1} concedes': '{1} വിട്ടുകൊടുത്തു; {0} കിട്ടി',
    'made {0} and takes {1}': '{0} ജയിച്ചു; {1} കിട്ടി',
    'set {0} and takes {1}': 'എതിർ വിളി ({0}) തോൽപ്പിച്ചു; {1} കിട്ടി',
    // ---- server messages that arrive as fixed text
    'Not ready': 'തയ്യാറായിട്ടില്ല',
    'Room not found. Check the code.': 'ടേബിൾ കണ്ടില്ല. കോഡ് ഒന്നുകൂടി നോക്കൂ.',
    'That seat is taken.': 'ആ സീറ്റിൽ ആളുണ്ട്.',
    'Sit down first.': 'ആദ്യം ഒരു സീറ്റിൽ ഇരിക്കൂ.',
    'Only the host can change the bots': 'ബോട്ടുകളെ മാറ്റാൻ ഹോസ്റ്റിനേ പറ്റൂ',
    'Unknown bot style': 'ഈ ബോട്ട് ശൈലി അറിയില്ല',
    'Someone is still at that table.': 'ആ ടേബിളിൽ ഇപ്പോഴും ആളുണ്ട്.',
    'Only the host can reset the chips': 'മേശ റീസെറ്റ് ചെയ്യാൻ ഹോസ്റ്റിനേ പറ്റൂ',
    'Only seated players can concede': 'സീറ്റിൽ ഇരിക്കുന്നവർക്കേ വിട്ടുകൊടുക്കാൻ പറ്റൂ',
    'You can only concede during play': 'കളി നടക്കുമ്പോഴേ വിട്ടുകൊടുക്കാൻ പറ്റൂ',
    'A hand can only be conceded during play': 'കളി നടക്കുമ്പോഴേ വിട്ടുകൊടുക്കാൻ പറ്റൂ',
    'A concede request is already waiting': 'വിട്ടുകൊടുക്കാമോ എന്ന് ഒരാൾ ഇപ്പോൾത്തന്നെ ചോദിച്ചിട്ടുണ്ട്',
    'Not in bidding': 'ഇപ്പോൾ വിളി നടക്കുന്നില്ല',
    'Not your turn': 'നിങ്ങളുടെ ഊഴമല്ല',
    'Only the bidder may keep the contract': 'വിളിച്ചയാൾക്കേ വിളി വയ്ക്കാൻ പറ്റൂ',
    'Self-raise must be to a higher tier (40/48/56) in the same suit': 'സ്വന്തം വിളി ഉയർത്തുന്നത് അതേ ചിഹ്നത്തിൽ അടുത്ത നിലയിലേക്ക് (40/48/56) ആകണം',
    'Cannot redouble now': 'ഇപ്പോൾ റീഡബിൾ പറ്റില്ല',
    'Cannot double now': 'ഇപ്പോൾ ഡബിൾ പറ്റില്ല',
    'You can change only to another suit you hold, or NT, after being doubled': 'ഡബിൾ ആയാൽ കൈയിലുള്ള മറ്റൊരു ചിഹ്നത്തിലേക്കോ NT-യിലേക്കോ മാത്രമേ മാറ്റാൻ പറ്റൂ',
    'Only keep, raise, redouble or change suit in the self-raise window': 'ഇപ്പോൾ വയ്ക്കാം, ഉയർത്താം, റീഡബിൾ ചെയ്യാം, അല്ലെങ്കിൽ ചിഹ്നം മാറ്റാം; വേറൊന്നും പറ്റില്ല',
    'Opener must bid at least 28': 'കൈവിളിക്കാരൻ 28 എങ്കിലും വിളിക്കണം',
    'No higher bid possible': 'ഇതിലും കൂട്ടി വിളിക്കാൻ പറ്റില്ല',
    'You cannot bid a suit you do not hold': 'കൈയിലില്ലാത്ത ചിഹ്നം വിളിക്കാൻ പറ്റില്ല',
    'Unknown bid action': 'ഈ വിളി മനസ്സിലായില്ല',
    'Not in play': 'ഇപ്പോൾ കളി നടക്കുന്നില്ല',
    'You must follow suit': 'ഇറക്കിയ ചിഹ്നത്തിലെ ചീട്ട് തന്നെ ഇടണം',
    'Match started. Good luck!': 'മത്സരം തുടങ്ങി. ആശംസകൾ!',
    // ---- registered players (name + PIN)
    'Keep your record (rating, hands, matches) on any device.': 'നിങ്ങളുടെ കളിക്കണക്ക് (റേറ്റിങ്, കളികൾ, മത്സരങ്ങൾ) ഏതു ഫോണിലും സൂക്ഷിക്കാം.',
    'Sign in / Register': 'സൈൻ ഇൻ / രജിസ്റ്റർ',
    'Sign out': 'സൈൻ ഔട്ട്',
    'Back to the tables': 'ടേബിളുകളിലേക്ക് മടങ്ങൂ',
    'Rating': 'റേറ്റിങ്',
    'Hands': 'കളികൾ',
    'Bids': 'വിളികൾ',
    'Matches': 'മത്സരങ്ങൾ',
    'won {0}': 'ജയം {0}',
    'made {0}': 'ജയിച്ചത് {0}',
    'No email needed. Pick a player name and a PIN of 4 to 8 digits. Use the same two on any phone or computer and your record follows you. Nobody else can sit under a registered name.':
      'ഇമെയിൽ വേണ്ട. ഒരു പേരും 4 മുതൽ 8 അക്കം വരെയുള്ള ഒരു പിൻ നമ്പറും തിരഞ്ഞെടുക്കൂ. ഏതു ഫോണിലും കമ്പ്യൂട്ടറിലും ഇതേ പേരും പിന്നും നൽകിയാൽ നിങ്ങളുടെ കളിക്കണക്ക് കൂടെ വരും. രജിസ്റ്റർ ചെയ്ത പേരിൽ മറ്റാർക്കും ഇരിക്കാനാവില്ല.',
    'Player name': 'പേര്',
    'PIN (4 to 8 digits)': 'പിൻ (4 മുതൽ 8 അക്കം)',
    'Use a PIN only for this game, never your ATM PIN or any other important PIN. PINs are stored scrambled, but a short PIN can still be worked out.':
      'ഈ കളിക്കു മാത്രമുള്ള ഒരു പിൻ ഉപയോഗിക്കൂ; എടിഎം പിന്നോ മറ്റു പ്രധാനപ്പെട്ട പിന്നോ ഒരിക്കലും ഉപയോഗിക്കരുത്. പിൻ മറച്ചാണ് സൂക്ഷിക്കുന്നത്, എങ്കിലും ചെറിയ പിൻ കണ്ടുപിടിക്കാൻ കഴിയും.',
    'Sign in': 'സൈൻ ഇൻ',
    'Register this name': 'ഈ പേര് രജിസ്റ്റർ ചെയ്യൂ',
    'Signed in as {0}': 'സൈൻ ഇൻ ചെയ്തു: {0}',
    'Registered player': 'രജിസ്റ്റർ ചെയ്ത പേര്',
    'That name belongs to a registered player. Sign in, or pick another name.': 'ഈ പേര് മറ്റൊരാൾ രജിസ്റ്റർ ചെയ്തതാണ്. സൈൻ ഇൻ ചെയ്യൂ, അല്ലെങ്കിൽ വേറെ പേര് എടുക്കൂ.',
    'Leave the table first.': 'ആദ്യം ടേബിളിൽ നിന്ന് ഇറങ്ങൂ.',
    'Sign-in is not available right now.': 'ഇപ്പോൾ സൈൻ ഇൻ ലഭ്യമല്ല.',
    'A player name needs 2 to 18 letters.': 'പേരിന് 2 മുതൽ 18 അക്ഷരം വേണം.',
    'That name cannot be registered.': 'ഈ പേര് രജിസ്റ്റർ ചെയ്യാൻ പറ്റില്ല.',
    'The PIN must be 4 to 8 digits.': 'പിൻ 4 മുതൽ 8 അക്കം ആകണം.',
    'That name is already registered. Sign in instead.': 'ഈ പേര് നേരത്തെ രജിസ്റ്റർ ചെയ്തതാണ്. സൈൻ ഇൻ ചെയ്യൂ.',
    'Too many wrong PINs. Try again in 15 minutes.': 'പിൻ പലതവണ തെറ്റി. 15 മിനിറ്റ് കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കൂ.',
    'Wrong PIN.': 'പിൻ തെറ്റാണ്.',
    'No player with that name. Register it first.': 'ആ പേരിൽ ആരും രജിസ്റ്റർ ചെയ്തിട്ടില്ല. ആദ്യം രജിസ്റ്റർ ചെയ്യൂ.',
    // ---- replays of a registered player's last hands
    'Replay my last 5 hands': 'എന്റെ അവസാന 5 കളികൾ വീണ്ടും കാണൂ',
    'My last hands': 'എന്റെ അവസാന കളികൾ',
    'No hands yet. Hands you play while signed in show up here.': 'ഇതുവരെ കളികളില്ല. സൈൻ ഇൻ ചെയ്ത് കളിക്കുന്ന കളികൾ ഇവിടെ കാണാം.',
    'Void hand': 'അസാധുവായ കളി',
    'made with {0}': 'ജയിച്ചു, {0} പോയിന്റ്',
    'down with {0}': 'തോറ്റു, {0} പോയിന്റ്',
    '{0} deals.': 'വിളമ്പുന്നത് {0}.',
    'Trick {0}': 'പിടി {0}',
    '(you)': '(നിങ്ങൾ)',
    'Sign in first.': 'ആദ്യം സൈൻ ഇൻ ചെയ്യൂ.',
    'Replays are not available right now.': 'ഇപ്പോൾ റീപ്ലേ ലഭ്യമല്ല.'
  };

  // The bots' names, shown in Malayalam script (only for bot seats; a player's typed name is never changed).
  const BOTS = { Kuttan: 'കുട്ടൻ', Ammini: 'അമ്മിണി', Pappan: 'പാപ്പൻ', Chinnu: 'ചിന്നു', Unni: 'ഉണ്ണി', Kunjamma: 'കുഞ്ഞമ്മ', Appu: 'അപ്പു', Sarojini: 'സരോജിനി', Mathai: 'മത്തായി', Leela: 'ലീല', Jalaja: 'ജലജ', Ponnappan: 'പൊന്നപ്പൻ' };

  // Server sentences with names or numbers in them: [pattern, Malayalam with $1, $2].
  // Order matters where one sentence ends like another.
  const PATTERNS = [
    // errors
    [/^(.+) is full, so you are on (.+)\.$/, '$1 നിറഞ്ഞു, അതുകൊണ്ട് നിങ്ങളുടെ ടീം: $2.'],
    [/^(.+) wants to play on\.$/, '$1: കളി തുടരാം എന്നു പറഞ്ഞു.'],
    [/^Bid must be between (\d+) and (\d+)$/, 'വിളി $1-നും $2-നും ഇടയിലാകണം'],
    [/^Cannot say Plus (\d*) in that suit$/, 'ആ ചിഹ്നത്തിൽ പ്ലസ് $1 പറയാൻ പറ്റില്ല'],
    [/^Cannot say Plus (\d*) now$/, 'ഇപ്പോൾ പ്ലസ് $1 പറയാൻ പറ്റില്ല'],
    [/^Cannot bid (\d+) NS now$/, 'ഇപ്പോൾ $1 എൻ.എസ് വിളിക്കാൻ പറ്റില്ല'],
    // system chat
    [/^(.+) is now the host\.$/, 'ഇനി ഹോസ്റ്റ്: $1.'],
    [/^(.+) bid and won the first hand: the kunukku comes off the whole team!$/, '$1 ആദ്യ കളി വിളിച്ച് ജയിച്ചു: ടീം മുഴുവൻ കുണുക്ക് ഊരി!'],
    [/^(.+) won the match: the kunukku comes off the whole team!$/, '$1 മത്സരം ജയിച്ചു: ടീം മുഴുവൻ കുണുക്ക് ഊരി!'],
    [/^(.+) made the bid and takes off the kunukku\.$/, '$1 വിളിച്ച് ജയിച്ചു; കുണുക്ക് ഊരി.'],
    [/^(.+) wears the kunukku!$/, '$1 കുണുക്ക് അണിയുന്നു!'],
    [/^(.+) created the table\.$/, '$1 ടേബിൾ തുടങ്ങി.'],
    [/^(.+) joined\.$/, '$1 ചേർന്നു.'],
    [/^(.+) is watching\.$/, '$1 കളി കാണുന്നു.'],
    [/^(.+) took over (.+)'s old seat\.$/, '$2 ഇരുന്ന സീറ്റിൽ ഇനി $1.'],
    [/^(.+) took over from (.+)\.$/, '$2 മാറി; പകരം $1.'],
    [/^(.+) was replaced by a bot\.$/, '$1 മാറി; പകരം ബോട്ട്.'],
    [/^Bots set to (.+)\.$/, 'ബോട്ടുകൾ: $1.'],
    [/^(.+) is now called (.+)\.$/, '$1: പുതിയ പേര് $2.'],
    [/^Chips reset to (\d+) each\.$/, 'മേശ വീണ്ടും $1 വീതം.'],
    [/^(.+) conceded the hand\.$/, '$1 കളി വിട്ടുകൊടുത്തു.'],
    [/^(.+) left — a bot took the seat\.$/, '$1 പോയി — സീറ്റിൽ ബോട്ട് ഇരുന്നു.'],
    [/^(.+) left\.$/, '$1 പോയി.'],
    [/^(.+) stopped watching\.$/, '$1 കാണൽ നിർത്തി.'],
    // hand log
    [/^Hand (\d+): (.+) deals\.$/, 'കളി $1: വിളമ്പിയത് $2.'],
    [/^Contract: (.+) — (.+)$/, 'വിളി ഉറച്ചു: $1 — $2'],
    [/^Hand void: (.+) holds no (.+)\. No chips change; the deal passes on\.$/, 'കളി അസാധു: $1 · $2 ഇല്ല. മേശ മാറില്ല; അടുത്തയാൾ ചീട്ട് വിളമ്പും.'],
    [/^Hand stopped after trick (\d+): target reached \((\d+) points left\)\.$/, 'പിടി $1 കഴിഞ്ഞ് കളി നിർത്തി: ലക്ഷ്യം എത്തി (ബാക്കി $2 പോയിന്റ്).'],
    [/^Hand stopped after trick (\d+): target out of reach \((\d+) points left\)\.$/, 'പിടി $1 കഴിഞ്ഞ് കളി നിർത്തി: ലക്ഷ്യം ഇനി എത്തില്ല (ബാക്കി $2 പോയിന്റ്).'],
    [/^(.+) concedes the hand\.$/, '$1 കളി വിട്ടുകൊടുക്കുന്നു.'],
    [/^(.+) conceded — pays (\d+) chip\(s\)\.$/, '$1 വിട്ടുകൊടുത്തു — $2 മേശ കൊടുക്കും.'],
    [/^(.+) made (\d+) with (\d+) — receives (\d+) chip\(s\)\.$/, '$1 ജയിച്ചു: വിളി $2, കിട്ടിയത് $3 — $4 മേശ വാങ്ങും.'],
    [/^(.+) fell short of (\d+) with (\d+) — pays (\d+) chip\(s\)\.$/, '$1 തോറ്റു: വിളി $2, കിട്ടിയത് $3 — $4 മേശ കൊടുക്കും.'],
    [/^(.+) wins the match!$/, '$1 മത്സരം ജയിച്ചു!'],
    // a call, as the log writes it
    [/^Change to (.+)$/, 'മാറ്റി: $1'],
    [/^Raise to (.+)$/, 'ഉയർത്തി: $1'],
    [/^Plus (\d) \((.+)\)$/, 'പ്ലസ് $1 ($2)'],
    [/^(\d+) NS \(no (.+)\)$/, '$1 എൻ.എസ് ($2 ഇല്ല)'],
    [/^(\d+) pts$/, '$1 പോയിന്റ്']
  ];

  let on = false;
  const T = (en, ...a) => {
    const s = (on && ML[en]) || en;
    return a.length ? s.replace(/\{(\d)\}/g, (_, i) => a[i]) : s;
  };
  // A whole line from the server (toast, system chat, log line, call text): fixed text first, then patterns.
  // Captured pieces that are themselves known words (Team A, Spades, a bot style) are translated too.
  const fromServer = (text) => {
    if (!on || typeof text !== 'string') return text;
    if (ML[text]) return ML[text];
    for (const [re, ml] of PATTERNS) {
      const m = re.exec(text);
      if (m) return ml.replace(/\$(\d)/g, (_, i) => ML[m[i]] || m[i]);
    }
    return text;
  };

  // Static page text: data-t="text" (default), "title", "aria", "placeholder", or several separated by spaces.
  const GET = { text: (e) => e.textContent, title: (e) => e.title, aria: (e) => e.getAttribute('aria-label'), placeholder: (e) => e.placeholder };
  const SET = { text: (e, v) => { e.textContent = v; }, title: (e, v) => { e.title = v; }, aria: (e, v) => e.setAttribute('aria-label', v), placeholder: (e, v) => { e.placeholder = v; } };
  const orig = new WeakMap();
  function applyStatic() {
    document.querySelectorAll('[data-t]').forEach((el) => {
      const kinds = (el.dataset.t || 'text').split(' ');
      if (!orig.has(el)) orig.set(el, Object.fromEntries(kinds.map((k) => [k, GET[k](el)])));
      kinds.forEach((k) => SET[k](el, T(orig.get(el)[k])));
    });
    document.querySelectorAll('.lang-btn').forEach((b) => { b.textContent = on ? 'English' : 'മലയാളം'; b.lang = on ? 'en' : 'ml'; });
  }
  const save = (v) => { try { localStorage.setItem('g56lang', v); } catch { /* private mode */ } };
  const saved = () => { try { return localStorage.getItem('g56lang'); } catch { return null; } };
  function set(ml) {
    on = !!ml;
    document.body.classList.toggle('lang-ml', on);
    document.documentElement.lang = on ? 'ml' : 'en';
    applyStatic();
  }

  const asked = new URLSearchParams(location.search).get('lang');   // ?lang=ml / ?lang=en in a shared link
  if (asked === 'ml' || asked === 'en') save(asked);
  window.T = T;
  window.Lang = {
    isMl: () => on,
    toggle: () => { set(!on); save(on ? 'ml' : 'en'); },
    fromServer,
    botName: (n) => (on && BOTS[n]) || n
  };
  set(saved() === 'ml');
})();
