# Pulling the logged hands from Supabase (kerala-56)

Every finished hand on play56.in and the Render site is saved to the `hands`
table in Supabase. This downloads all of them to one local file.

## One-time setup
1. Install Node.js 18 or newer.
2. Clone the repo: `git clone https://github.com/p-dileep/kerala-56` and `cd` into it.
3. Create a file named `.env` in the project root with two lines:

       SUPABASE_URL=https://<project>.supabase.co
       SUPABASE_SERVICE_KEY=<service role key>

   Both values are in the Supabase dashboard under Project Settings -> API.
   `.env` and `data/` are git-ignored; never commit either.
4. Create the output folder: `mkdir data`

## Each pull
Run from the project root (Git Bash, or any shell that writes UTF-8):

    node test/fetch_hands.js > data/hands.jsonl

It downloads the whole table every time (oldest first, 1000 rows per request)
and overwrites the file. No packages need installing.

## Check it worked
    wc -l data/hands.jsonl        # number of hands
    tail -n 1 data/hands.jsonl    # the latest hand

## What is in the file
One JSON object per line, one line per finished hand:
id, created_at (UTC), room, players, hand_no, dealer, bot_style, seats
(name and human/bot for each seat), dealt, auction, contract, played, result,
tables_after, game_version (`play56.in@<commit>` or `render@<commit>`).

Only finished hands are logged; a hand abandoned mid-play never appears.

## If it fails
- "SUPABASE_URL and SUPABASE_SERVICE_KEY are required": `.env` is missing or
  in the wrong folder.
- "fetch failed 401": the key is wrong or was rotated; copy the current one
  from the dashboard.
- Connection error or timeout: a free Supabase project pauses after 7 idle
  days; resume it in the dashboard and run again.

## What the file is used for
    node test/imitate.js          # how often the bots agree with human bids
    node test/imitate.js tune 5   # fit the bidding numbers to the human calls

## Note on the key
The service key gives full read and write access to the table. Share it only
with someone trusted to edit the data.
