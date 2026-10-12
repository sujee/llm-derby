# Question calibration

2026-10-12 05:24 UTC · https://api.openai.com/v1 · 24 questions (0 from the bank + 24 generated Expert, seed 2) · 3 models

## Accuracy by level

| Model | Easy | Medium | Hard | Expert | Overall | Errors | Median time |
| --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-6-astra | – | – | – | 100% | 100% | 2 | 6.5s |
| gpt-6-sol | – | – | – | 92% | 92% | 0 | 4.9s |
| gpt-6-luna | – | – | – | 58% | 58% | 0 | 5.3s |

## Likely answer-key problems: models agree on a different answer (1)

| # | Level | Question | Key (aliases) | Answers (gpt-6-astra, gpt-6-sol, gpt-6-luna) |
| --- | --- | --- | --- | --- |
| 100014 | expert | What is the sum of the digits of 6 to the power 633? | 2205 | ✗ (The operation was aborted due to timeout)<br>✗ sum(map(int, str(6633)))<br>✗ sum(map(int, str(6633))) |

## Every model wrong (0)

_None._

## Labeled Easy, but most models miss it (0)

_None._

## Labeled Hard / Expert, but every model gets it (14)

| # | Level | Question | Key (aliases) | Answers (gpt-6-astra, gpt-6-sol, gpt-6-luna) |
| --- | --- | --- | --- | --- |
| 100001 | expert | How many days are there from 1 September 2001 to 9 July 2033? (Give the difference in days.) | 11634 | ✓ 11,634 days<br>✓ 11634<br>✓ 11,634 days |
| 100002 | expert | Write this string backwards: cherrynumbermarblejacketquartzhelmetzipperlemon | nomelreppiztemlehztrauqtekcajelbramrebmunyrrehc | ✓ nomelreppiztemlehztrauqtekcajelbramrebmunyrrehc<br>✓ nomelreppiztemlehztrauqtekcajelbramrebmunyrrehc<br>✓ nomelreppiztemlehztrauqtekcajelbramrebmunyrrehc |
| 100004 | expert | Start at 286057257. If the number is even, halve it; if it is odd, multiply by 3 and add 1. How many steps does it take to reach 1? | 230 | ✓ 230 steps<br>✓ 230<br>✓ 230 steps |
| 100005 | expert | Start at 34595886. If the number is even, halve it; if it is odd, multiply by 3 and add 1. Let S be the number of steps to reach 1. What is the smallest prime number greater than S × 100? | 6907 | ✓ 6907<br>✓ 6907<br>✓ 6907 |
| 100006 | expert | Multiply 58352676 by 12473197, then add up the digits of the product. What is the sum? | 60 | ✓ 60<br>✓ 60<br>✓ 60 |
| 100009 | expert | What is 4199944124 × 69878855? | 293487286449098020 | ✓ 293487286449098020<br>✓ 293487286449098020<br>✓ 293487286449098020 |
| 100012 | expert | In the Gregorian calendar, what day of the week is 1 July 2377? | Friday (Fri) | ✓ Friday<br>✓ Friday<br>✓ Friday |
| 100013 | expert | Sort these words alphabetically: tunnel, saddle, quartz, jacket, island, dinner, apple, tablet, violin, window, salmon, jungle, rabbit, pepper, summer, zipper, lemon, anchor, yogurt, silver, velvet, ribbon, dragon, spider, parrot, orange, garden, winter, candle, parcel, oyster, cobalt, magnet, engine, meadow, banana, number, cherry, teapot, eagle. Which word comes 29th? | silver | ✓ silver<br>✓ silver<br>✓ silver |
| 100015 | expert | What is 2458944822 × 26682898? | 65611773873054156 | ✓ 65611773873054156<br>✓ 65611773873054156<br>✓ 65,611,773,873,054,156 |
| 100017 | expert | How many days are there from 24 September 2095 to 24 October 2167? (Give the difference in days.) | 26327 | ✓ 26327 days<br>✓ 26327 days<br>✓ 26327 days |
| 100018 | expert | How many times does the letter "b" appear in this string: gekdbfckaghaedakggfkacdeedkakbeadafaggegcacdbekbffafehheeeahhhabhhkhdehbkhbbbahgdgeadgfakgbfgfgbbafecefcakehggdkgfkbfdebgdakfehdgkbabedgagbdkcbgbbgchehhbhehkkcafbhhfghdagegfebdkhgbfgbgdabdggdcfgchdbgf | 27 | ✓ 27<br>✓ 27<br>✓ 27 |
| 100020 | expert | Multiply 80125488 by 31533918, then add up the digits of the product. What is the sum? | 72 | ✓ 72<br>✓ 72<br>✓ 72 |
| 100021 | expert | Write the decimal number 4220559 in base 7. Reverse the order of its digits, read the result as a base 7 number, and give that value in decimal. | 802233 | ✓ 802233<br>✓ 802233<br>✓ 802233 |
| 100022 | expert | Sort these words alphabetically: window, garden, meadow, banana, lemon, walnut, orange, velvet, dinner, engine, spider, cobalt, number, jungle, cherry, jacket, magnet, pepper, ribbon, tablet, planet, helmet, puzzle, canyon, oyster, pencil, parcel, kettle, candle, rabbit, needle, saddle, teapot, ladder, carpet, summer, harbor, tunnel, marble, ginger. Which word comes 4th? | carpet | ✓ carpet<br>✓ carpet<br>✓ carpet |
