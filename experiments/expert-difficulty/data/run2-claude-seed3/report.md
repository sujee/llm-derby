# Question calibration

2026-10-12 05:25 UTC · https://api.anthropic.com/v1 · 24 questions (0 from the bank + 24 generated Expert, seed 3) · 3 models

## Accuracy by level

| Model | Easy | Medium | Hard | Expert | Overall | Errors | Median time |
| --- | --- | --- | --- | --- | --- | --- | --- |
| claude-fable-5-1 | – | – | – | 95% | 95% | 3 | 8.5s |
| claude-opus-5-5 | – | – | – | 95% | 95% | 3 | 7.5s |
| claude-sonnet-5-5 | – | – | – | 95% | 95% | 3 | 5.4s |

## Likely answer-key problems: models agree on a different answer (0)

_None._

## Every model wrong (0)

_None._

## Labeled Easy, but most models miss it (0)

_None._

## Labeled Hard / Expert, but every model gets it (19)

| # | Level | Question | Key (aliases) | Answers (claude-fable-5-1, claude-opus-5-5, claude-sonnet-5-5) |
| --- | --- | --- | --- | --- |
| 100001 | expert | What is 3912612996 × 72152325? | 282304124486615700 | ✓ 282304124486615700<br>✓ 282304124486615700<br>✓ 282304124486615700 |
| 100002 | expert | Write the decimal number 286818394391 in base 12. Use the letters a, b, … for digits above 9. Give just the digits, without a base subscript. | 47706a9715b | ✓ 47706a9715b<br>✓ 47706a9715b<br>✓ 47706a9715b |
| 100003 | expert | Multiply 57378571 by 84856046, then add up the digits of the product. What is the sum? | 80 | ✓ 80<br>✓ 80<br>✓ 80 |
| 100005 | expert | How many days are there from 17 March 2063 to 3 August 2090? (Give the difference in days.) | 10001 | ✓ 10001<br>✓ 10001<br>✓ 10001 |
| 100006 | expert | Start at 937453590. If the number is even, halve it; if it is odd, multiply by 3 and add 1. How many steps does it take to reach 1? | 224 | ✓ 224<br>✓ 224<br>✓ 224 |
| 100007 | expert | In the Gregorian calendar, what day of the week is 1 July 2215? | Saturday (Sat) | ✓ Saturday<br>✓ Saturday<br>✓ Saturday |
| 100008 | expert | Sort these words alphabetically: pebble, salmon, oyster, bridge, tablet, forest, tunnel, winter, canyon, velvet, ticket, dinner, banana, jacket, teapot, walnut, cobalt, parcel, candle, dragon, carpet, quartz, eagle, ladder, anchor, ribbon, window, harbor, parrot, magnet, violin, falcon, pencil, planet, engine, spider, orange, needle, jungle, zipper. Which word comes 39th? | winter | ✓ winter<br>✓ winter<br>✓ winter |
| 100009 | expert | Write this string backwards: velvetcobaltcherrydinnergardenmeadowkettleoyster | retsyoelttekwodaemnedragrennidyrrehctlaboctevlev | ✓ retsyoelttekwodaemnedragrennidyrrehctlaboctevlev<br>✓ retsyoelttekwodaemnedragrennidyrrehctlaboctevlev<br>✓ retsyoelttekwodaemnedragrennidyrrehctlaboctevlev |
| 100010 | expert | Write the decimal number 8804289 in base 3. Reverse the order of its digits, read the result as a base 3 number, and give that value in decimal. | 3088249 | ✓ 3088249<br>✓ 3088249<br>✓ 3088249 |
| 100011 | expert | Start at 18573863. If the number is even, halve it; if it is odd, multiply by 3 and add 1. Let S be the number of steps to reach 1. What is the smallest prime number greater than S × 100? | 10211 | ✓ 10211<br>✓ 10211<br>✓ 10211 |
| 100012 | expert | How many times does the letter "d" appear in this string: bhghdadcbbdcaeedkkkcccbgabdkcfbfhakcaaeghefhfhhfcfkebbebfhbhfcckgehdhedgdgcgegkhhdbabgfkcgchcefhhahckhggdacfeefakgfhkkkhadeaffhgcfebadgcdfebadacbcdgdgekkfhhhgdkcddcghdeddacdggkeagbeefefbhcdgachchdfabb | 25 | ✓ 25<br>✓ 25<br>✓ 25 |
| 100014 | expert | What is the remainder when 77709 to the power 359660144 is divided by 654745? | 36271 | ✓ 36271<br>✓ 36271<br>✓ 36271 |
| 100015 | expert | How many days are there from 9 November 1843 to 10 January 1850? (Give the difference in days.) | 2254 | ✓ 2254<br>✓ 2254<br>✓ 2254 |
| 100017 | expert | What is 1953680717 × 67726512? | 132315980524069104 | ✓ 132315980524069104<br>✓ 132315980524069104<br>✓ 132315980524069104 |
| 100019 | expert | Multiply 47139702 by 57302151, then add up the digits of the product. What is the sum? | 45 | ✓ 45<br>✓ 45<br>✓ 45 |
| 100020 | expert | Start at 715353967. If the number is even, halve it; if it is odd, multiply by 3 and add 1. How many steps does it take to reach 1? | 239 | ✓ 239<br>✓ 239<br>✓ 239 |
| 100021 | expert | How many times does the letter "e" appear in this string: kabgddeeehbhfbhkgeecdbbffhhagecaehdeakghddfkbffbcheckckbhaebabcbcgcddhbkcgegkghckgffhagfgaddgfbgeddakcdhbdbecegbgkchkbdhgkdkcbekgfgdeggafgdabdchaakehhfbfcffhhebghgahbcadgeehgdgcfeehbgecagahdbdahckdbfc | 23 | ✓ 23<br>✓ 23<br>✓ 23 |
| 100022 | expert | Write the decimal number 17012354 in base 3. Reverse the order of its digits, read the result as a base 3 number, and give that value in decimal. | 33946678 | ✓ 33946678<br>✓ 33946678<br>✓ 33946678 |
| 100023 | expert | Sort these words alphabetically: meadow, canyon, candle, basket, planet, helmet, dinner, salmon, yogurt, pencil, saddle, pocket, garden, anchor, magnet, forest, pebble, marble, summer, bridge, jacket, cherry, ticket, winter, lemon, walnut, cobalt, silver, orange, spider, teapot, violin, oyster, puzzle, banana, carpet, ginger, tablet, ribbon, kettle. Which word comes 18th? | magnet | ✓ magnet<br>✓ magnet<br>✓ magnet |
