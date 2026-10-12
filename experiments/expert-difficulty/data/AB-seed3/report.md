# Question calibration

2026-10-12 03:43 UTC · https://api.openai.com/v1 · 24 questions (0 from the bank + 24 generated Expert, seed 3) · 3 models

## Accuracy by level

| Model | Easy | Medium | Hard | Expert | Overall | Errors | Median time |
| --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-6-astra | – | – | – | 95% | 95% | 3 | 7.2s |
| gpt-6-sol | – | – | – | 78% | 78% | 1 | 4.9s |
| gpt-6-luna | – | – | – | 75% | 75% | 0 | 6.7s |

## Likely answer-key problems: models agree on a different answer (0)

_None._

## Every model wrong (1)

| # | Level | Question | Key (aliases) | Answers (gpt-6-astra, gpt-6-sol, gpt-6-luna) |
| --- | --- | --- | --- | --- |
| 100014 | expert | What is the remainder when 35903 to the power 285219913 is divided by 779318? | 3265 | ✗ 206957<br>✗ Unable to determine reliably<br>✗ 650493 |

## Labeled Easy, but most models miss it (0)

_None._

## Labeled Hard / Expert, but every model gets it (16)

| # | Level | Question | Key (aliases) | Answers (gpt-6-astra, gpt-6-sol, gpt-6-luna) |
| --- | --- | --- | --- | --- |
| 100001 | expert | What is 3912612996 × 72152325? | 282304124486615700 | ✓ 282304124486615700<br>✓ 282304124486615700<br>✓ 282304124486615700 |
| 100002 | expert | Write the decimal number 286818394391 in base 12. Use the letters a, b, … for digits above 9. Give just the digits, without a base subscript. | 47706a9715b | ✓ 47706a9715b<br>✓ 47706a9715b<br>✓ 47706a9715b |
| 100005 | expert | How many days are there from 17 March 2063 to 3 August 2090? (Give the difference in days.) | 10001 | ✓ 10001 days<br>✓ 10001 days<br>✓ 10001 days |
| 100006 | expert | Start at 937453590. If the number is even, halve it; if it is odd, multiply by 3 and add 1. How many steps does it take to reach 1? | 224 | ✓ 224<br>✓ 224<br>✓ 224 steps |
| 100007 | expert | In the Gregorian calendar, what day of the week is 1 July 2215? | Saturday (Sat) | ✓ Saturday<br>✓ Saturday<br>✓ Saturday |
| 100008 | expert | Sort these words alphabetically: pebble, salmon, oyster, bridge, tablet, forest, tunnel, winter, canyon, velvet, ticket, dinner, banana, jacket, teapot, walnut, cobalt, parcel, candle, dragon, carpet, quartz, eagle, ladder, anchor, ribbon, window, harbor, parrot, magnet, violin, falcon, pencil, planet, engine, spider, orange, needle, jungle, zipper. Which word comes 39th? | winter | ✓ winter<br>✓ winter<br>✓ winter |
| 100009 | expert | Write this string backwards: zpwzvjqxkpdqnhwbvclwbrdhznfbfqqvrvdfdqrpsjzczfkmlphrbmtjlkzc | czkljtmbrhplmkfzczjsprqdfdvrvqqfbfnzhdrbwlcvbwhnqdpkxqjvzwpz | ✓ czkljtmbrhplmkfzczjsprqdfdvrvqqfbfnzhdrbwlcvbwhnqdpkxqjvzwpz<br>✓ czkljtmbrhplmkfzczjsprqdfdvrvqqfbfnzhdrbwlcvbwhnqdpkxqjvzwpz<br>✓ czkljtmbrhplmkfzczjsprqdfdvrvqqfbfnzhdrbwlcvbwhnqdpkxqjvzwpz |
| 100010 | expert | Write the decimal number 11200455 in base 3. Reverse the order of its digits, read the result as a base 3 number, and give that value in decimal. | 1128983 | ✓ 1128983<br>✓ 1128983<br>✓ 1128983 |
| 100011 | expert | Start at 12756856. If the number is even, halve it; if it is odd, multiply by 3 and add 1. Let S be the number of steps to reach 1. What is the smallest prime number greater than S × 100? | 14813 | ✓ 14813<br>✓ 14813<br>✓ 14813 |
| 100015 | expert | How many days are there from 22 December 1812 to 13 January 1822? (Give the difference in days.) | 3309 | ✓ 3309 days<br>✓ 3309 days<br>✓ 3309 days |
| 100016 | expert | What is 1083685753 × 47770191? | 51767875404788823 | ✓ 51767875404788823<br>✓ 51767875404788823<br>✓ 51,767,875,404,788,823 |
| 100017 | expert | Multiply 82779813 by 17879313, then add up the digits of the product. What is the sum? | 72 | ✓ 72<br>✓ 72<br>✓ 72 |
| 100018 | expert | Start at 62250663. If the number is even, halve it; if it is odd, multiply by 3 and add 1. Let S be the number of steps to reach 1. What is the smallest prime number greater than S × 100? | 18119 | ✓ 18119<br>✓ 18119<br>✓ 18119 |
| 100020 | expert | How many times does the letter "d" appear in this string: bahdchhhcggbckfhgdgdcchfabeggdgbgdahbehedekdbdbafafafdfedegkabgddeeehbhfbhkgeecdbbffhhagecaehdeakghddfkbffbcheckckbhaebabcbcgcddhbkcgegkghckgffhagfgaddgfbgeddakcdhbdbecegbgkchkbdhgkdkcbekgfgdeggafgdab | 28 | ✓ 28<br>✓ 28<br>✓ 28 |
| 100022 | expert | In the Gregorian calendar, what day of the week is 5 December 1687? | Friday (Fri) | ✓ Friday<br>✓ Friday<br>✓ Friday |
| 100023 | expert | Sort these words alphabetically: walnut, number, helmet, oyster, window, cobalt, kettle, candle, parrot, eagle, jungle, basket, spider, ticket, salmon, rabbit, teapot, forest, anchor, puzzle, parcel, carpet, velvet, pepper, saddle, island, zipper, summer, harbor, cherry, jacket, dinner, ladder, pocket, ginger, garden, marble, falcon, banana, yogurt. Which word comes 14th? | harbor | ✓ harbor<br>✓ harbor<br>✓ harbor |
