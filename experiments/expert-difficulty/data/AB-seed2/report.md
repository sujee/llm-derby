# Question calibration

2026-10-12 03:43 UTC · https://api.openai.com/v1 · 24 questions (0 from the bank + 24 generated Expert, seed 2) · 3 models

## Accuracy by level

| Model | Easy | Medium | Hard | Expert | Overall | Errors | Median time |
| --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-6-astra | – | – | – | 100% | 100% | 3 | 8.4s |
| gpt-6-sol | – | – | – | 79% | 79% | 0 | 6.1s |
| gpt-6-luna | – | – | – | 63% | 63% | 0 | 8.3s |

## Likely answer-key problems: models agree on a different answer (1)

| # | Level | Question | Key (aliases) | Answers (gpt-6-astra, gpt-6-sol, gpt-6-luna) |
| --- | --- | --- | --- | --- |
| 100010 | expert | Let N be the sum of the digits of 3 to the power 157. In the Gregorian calendar, what day of the week is it N days after 14 November 2079? | Thursday (Thu) | ✓ Thursday<br>✗ Monday<br>✗ Monday |

## Every model wrong (0)

_None._

## Labeled Easy, but most models miss it (0)

_None._

## Labeled Hard / Expert, but every model gets it (14)

| # | Level | Question | Key (aliases) | Answers (gpt-6-astra, gpt-6-sol, gpt-6-luna) |
| --- | --- | --- | --- | --- |
| 100001 | expert | How many days are there from 1 September 2001 to 9 July 2033? (Give the difference in days.) | 11634 | ✓ 11,634 days<br>✓ 11634<br>✓ 11,634 days |
| 100002 | expert | Write this string backwards: zbxcdfbxmqzgmjcncczvbzcznfrctxvlxcszvqnbvvnjxxljbzjltwxlgqqs | sqqglxwtljzbjlxxjnvvbnqvzscxlvxtcrfnzczbvzccncjmgzqmxbfdcxbz | ✓ sqqglxwtljzbjlxxjnvvbnqvzscxlvxtcrfnzczbvzccncjmgzqmxbfdcxbz<br>✓ sqqglxwtljzbjlxxjnvvbnqvzscxlvxtcrfnzczbvzccncjmgzqmxbfdcxbz<br>✓ sqqglxwtljzbjlxxjnvvbnqvzscxlvxtcrfnzczbvzccncjmgzqmxbfdcxbz |
| 100005 | expert | Start at 53771470. If the number is even, halve it; if it is odd, multiply by 3 and add 1. Let S be the number of steps to reach 1. What is the smallest prime number greater than S × 100? | 15013 | ✓ 15013<br>✓ 15013<br>✓ 15013 |
| 100006 | expert | Multiply 12473197 by 35927932, then add up the digits of the product. What is the sum? | 64 | ✓ 64<br>✓ 64<br>✓ 64 |
| 100008 | expert | Write the decimal number 461666755958 in base 7. Give just the digits, without a base subscript. | 45232350451352 | ✓ 45232350451352<br>✓ 45232350451352<br>✓ 45232350451352 |
| 100009 | expert | What is 6987885568 × 10784217? | 75358874336480256 | ✓ 75358874336480256<br>✓ 75358874336480256<br>✓ 75,358,874,336,480,256 |
| 100012 | expert | In the Gregorian calendar, what day of the week is 8 June 1699? | Monday (Mon) | ✓ Monday<br>✓ Monday<br>✓ Monday |
| 100013 | expert | Sort these words alphabetically: cherry, helmet, orange, winter, jacket, parrot, saddle, apple, teapot, ladder, tablet, silver, walnut, ribbon, planet, yogurt, ticket, oyster, anchor, velvet, spider, jungle, violin, dinner, summer, parcel, rabbit, ginger, pepper, candle, pebble, magnet, dragon, marble, engine, salmon, banana, window, cobalt, garden. Which word comes 21st? | parrot | ✓ parrot<br>✓ parrot<br>✓ parrot |
| 100015 | expert | Sort these words alphabetically: candle, forest, canyon, salmon, winter, number, pepper, carpet, ticket, helmet, ladder, saddle, violin, pebble, meadow, jacket, lemon, rabbit, ribbon, eagle, jungle, cherry, apple, puzzle, bridge, parrot, pencil, magnet, dragon, summer, garden, engine, velvet, silver, oyster, parcel, yogurt, needle, quartz, anchor. Which word comes 32nd? | saddle | ✓ saddle<br>✓ saddle<br>✓ saddle |
| 100016 | expert | How many days are there from 22 January 2055 to 18 October 2099? (Give the difference in days.) | 16340 | ✓ 16340<br>✓ 16340<br>✓ 16340 days |
| 100017 | expert | How many times does the letter "c" appear in this string: eeahhhabhhkhdehbkhbbbahgdgeadgfakgbfgfgbbafecefcakehggdkgfkbfdebgdakfehdgkbabedgagbdkcbgbbgchehhbhehkkcafbhhfghdagegfebdkhgbfgbgdabdggdcfgchdbgfbdghcagbgkaahagkabgackadkebdgkeabgdbkkbhakfcekbbkdacfheh | 11 | ✓ 11<br>✓ 11<br>✓ 11 |
| 100018 | expert | Write the decimal number 691334337496 in base 12. Use the letters a, b, … for digits above 9. Give just the digits, without a base subscript. | b1b9a579734 | ✓ b1b9a579734<br>✓ b1b9a579734<br>✓ b1b9a579734 |
| 100019 | expert | Start at 42191310. If the number is even, halve it; if it is odd, multiply by 3 and add 1. Let S be the number of steps to reach 1. What is the smallest prime number greater than S × 100? | 9803 | ✓ 9803<br>✓ 9803<br>✓ 9803 |
| 100020 | expert | Let N be the sum of the digits of 7 to the power 128. In the Gregorian calendar, what day of the week is it N days after 20 May 2083? | Wednesday (Wed) | ✓ Wednesday<br>✓ Wednesday<br>✓ Wednesday |
