# Question calibration

2026-10-12 03:34 UTC · https://api.openai.com/v1 · 24 questions (0 from the bank + 24 generated Expert, seed 1) · 3 models

## Accuracy by level

| Model | Easy | Medium | Hard | Expert | Overall | Errors | Median time |
| --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-6-astra | – | – | – | 90% | 90% | 3 | 7.1s |
| gpt-6-sol | – | – | – | 79% | 79% | 0 | 5.1s |
| gpt-6-luna | – | – | – | 58% | 58% | 0 | 7.3s |

## Likely answer-key problems: models agree on a different answer (1)

| # | Level | Question | Key (aliases) | Answers (gpt-6-astra, gpt-6-sol, gpt-6-luna) |
| --- | --- | --- | --- | --- |
| 100007 | expert | What is the sum of the digits of 7 to the power 875? | 3325 | ✗ sum(map(int, str(7875)))<br>✗ Unable to determine numerically<br>✗ sum(map(int, str(7875))) |

## Every model wrong (1)

| # | Level | Question | Key (aliases) | Answers (gpt-6-astra, gpt-6-sol, gpt-6-luna) |
| --- | --- | --- | --- | --- |
| 100007 | expert | What is the sum of the digits of 7 to the power 875? | 3325 | ✗ sum(map(int, str(7875)))<br>✗ Unable to determine numerically<br>✗ sum(map(int, str(7875))) |

## Labeled Easy, but most models miss it (0)

_None._

## Labeled Hard / Expert, but every model gets it (13)

| # | Level | Question | Key (aliases) | Answers (gpt-6-astra, gpt-6-sol, gpt-6-luna) |
| --- | --- | --- | --- | --- |
| 100000 | expert | Start at 255048657. If the number is even, halve it; if it is odd, multiply by 3 and add 1. How many steps does it take to reach 1? | 297 | ✓ 297<br>✓ 297<br>✓ 297 steps |
| 100001 | expert | What is 2390438214 × 54022950? | 129138524113011300 | ✓ 129138524113011300<br>✓ 129138524113011300<br>✓ 129138524113011300 |
| 100002 | expert | What is the remainder when 39463 to the power 767340917 is divided by 76696? | 60007 | ✓ 60007<br>✓ 60007<br>✓ 60007 |
| 100008 | expert | Start at 2346749. If the number is even, halve it; if it is odd, multiply by 3 and add 1. Let S be the number of steps to reach 1. What is the smallest prime number greater than S × 100? | 17401 | ✓ 17401<br>✓ 17401<br>✓ 17401 |
| 100009 | expert | Sort these words alphabetically: jungle, silver, ticket, summer, violin, dinner, cobalt, pocket, cherry, winter, puzzle, velvet, spider, engine, forest, salmon, ginger, marble, tunnel, tablet, helmet, planet, walnut, zipper, falcon, eagle, saddle, quartz, magnet, dragon, ribbon, parrot, parcel, kettle, canyon, basket, meadow, pencil, carpet, needle. Which word comes 8th? | eagle | ✓ eagle<br>✓ eagle<br>✓ eagle |
| 100011 | expert | In the Gregorian calendar, what day of the week is 7 November 2067? | Monday (Mon) | ✓ Monday<br>✓ Monday<br>✓ Monday |
| 100013 | expert | How many days are there from 16 June 1970 to 27 June 2035? (Give the difference in days.) | 23752 | ✓ 23,752 days<br>✓ 23752<br>✓ 23752 days |
| 100014 | expert | Write this string backwards: wktsgfwkznqldtqtdbttgjsbgcjxjlrdqtrmdlxmxzqfqqpxkxblgbnmtjvx | xvjtmnbglbxkxpqqfqzxmxldmrtqdrljxjcgbsjgttbdtqtdlqnzkwfgstkw | ✓ xvjtmnbglbxkxpqqfqzxmxldmrtqdrljxjcgbsjgttbdtqtdlqnzkwfgstkw<br>✓ xvjtmnbglbxkxpqqfqzxmxldmrtqdrljxjcgbsjgttbdtqtdlqnzkwfgstkw<br>✓ xvjtmnbglbxkxpqqfqzxmxldmrtqdrljxjcgbsjgttbdtqtdlqnzkwfgstkw |
| 100015 | expert | What is the remainder when 34085 to the power 561974746 is divided by 561872? | 20553 | ✓ 20553<br>✓ 20553<br>✓ 20553 |
| 100017 | expert | Sort these words alphabetically: saddle, teapot, cherry, yogurt, marble, pepper, bridge, planet, ladder, falcon, dinner, meadow, kettle, winter, magnet, jungle, anchor, engine, harbor, spider, needle, violin, forest, tablet, silver, pencil, garden, carpet, eagle, dragon, summer, basket, ticket, velvet, tunnel, candle, pebble, apple, rabbit, canyon. Which word comes 36th? | tunnel | ✓ tunnel<br>✓ tunnel<br>✓ tunnel |
| 100019 | expert | How many days are there from 3 February 2024 to 11 October 2052? (Give the difference in days.) | 10478 | ✓ 10478<br>✓ 10478 days<br>✓ 10,478 days |
| 100020 | expert | Start at 880744029. If the number is even, halve it; if it is odd, multiply by 3 and add 1. How many steps does it take to reach 1? | 229 | ✓ 229<br>✓ 229<br>✓ 229 steps |
| 100021 | expert | Write the decimal number 795738218245 in base 9. Give just the digits, without a base subscript. | 2731840753427 | ✓ 2731840753427<br>✓ 2731840753427<br>✓ 2731840753427 |
