# Question calibration

2026-10-12 05:25 UTC · https://api.anthropic.com/v1 · 24 questions (0 from the bank + 24 generated Expert, seed 1) · 3 models

## Accuracy by level

| Model | Easy | Medium | Hard | Expert | Overall | Errors | Median time |
| --- | --- | --- | --- | --- | --- | --- | --- |
| claude-fable-5-1 | – | – | – | 83% | 83% | 1 | 7.9s |
| claude-opus-5-5 | – | – | – | 95% | 95% | 4 | 9.6s |
| claude-sonnet-5-5 | – | – | – | 76% | 76% | 3 | 6.8s |

## Likely answer-key problems: models agree on a different answer (1)

| # | Level | Question | Key (aliases) | Answers (claude-fable-5-1, claude-opus-5-5, claude-sonnet-5-5) |
| --- | --- | --- | --- | --- |
| 100007 | expert | What is the sum of the digits of 7 to the power 875? | 3325 | ✗ 3334<br>✗ 3334<br>✗ 3334 |

## Every model wrong (1)

| # | Level | Question | Key (aliases) | Answers (claude-fable-5-1, claude-opus-5-5, claude-sonnet-5-5) |
| --- | --- | --- | --- | --- |
| 100007 | expert | What is the sum of the digits of 7 to the power 875? | 3325 | ✗ 3334<br>✗ 3334<br>✗ 3334 |

## Labeled Easy, but most models miss it (0)

_None._

## Labeled Hard / Expert, but every model gets it (16)

| # | Level | Question | Key (aliases) | Answers (claude-fable-5-1, claude-opus-5-5, claude-sonnet-5-5) |
| --- | --- | --- | --- | --- |
| 100000 | expert | Start at 255048657. If the number is even, halve it; if it is odd, multiply by 3 and add 1. How many steps does it take to reach 1? | 297 | ✓ 297<br>✓ 297<br>✓ 297 |
| 100001 | expert | What is 2390438214 × 54022950? | 129138524113011300 | ✓ 129138524113011300<br>✓ 129138524113011300<br>✓ 129138524113011300 |
| 100002 | expert | What is the remainder when 39463 to the power 767340917 is divided by 76696? | 60007 | ✓ 60007<br>✓ 60007<br>✓ 60007 |
| 100003 | expert | Write the decimal number 29300305 in base 3. Reverse the order of its digits, read the result as a base 3 number, and give that value in decimal. | 20997659 | ✓ 20997659<br>✓ 20997659<br>✓ 20997659 |
| 100005 | expert | How many times does the letter "f" appear in this string: fhcbfegbgegkcgbcdcbgfbcafhckgdcgkkgkhkbahchekgbgkbkbdbdcfeeahhcbckcbfecbbacgfbeebhckkhabakcghachhhbabdechckhfgcdcbckkbcaahdcbhckedgdceghabffacdhfddfakeffbahbgcfcekaabgaedhcakkahbdfedgbckfeabfcbffaaadg | 20 | ✓ 20<br>✓ 20<br>✓ 20 |
| 100006 | expert | Write the decimal number 798424680623 in base 11. Use the letters a, b, … for digits above 9. Give just the digits, without a base subscript. | 288678a0aa59 | ✓ 288678a0aa59<br>✓ 288678a0aa59<br>✓ 288678a0aa59 |
| 100008 | expert | Start at 2346749. If the number is even, halve it; if it is odd, multiply by 3 and add 1. Let S be the number of steps to reach 1. What is the smallest prime number greater than S × 100? | 17401 | ✓ 17401<br>✓ 17401<br>✓ 17401 |
| 100009 | expert | Sort these words alphabetically: jungle, silver, ticket, summer, violin, dinner, cobalt, pocket, cherry, winter, puzzle, velvet, spider, engine, forest, salmon, ginger, marble, tunnel, tablet, helmet, planet, walnut, zipper, falcon, eagle, saddle, quartz, magnet, dragon, ribbon, parrot, parcel, kettle, canyon, basket, meadow, pencil, carpet, needle. Which word comes 8th? | eagle | ✓ eagle<br>✓ eagle<br>✓ eagle |
| 100011 | expert | In the Gregorian calendar, what day of the week is 7 November 2067? | Monday (Mon) | ✓ Monday<br>✓ Monday<br>✓ Monday |
| 100012 | expert | Multiply 46496211 by 65346221, then add up the digits of the product. What is the sum? | 75 | ✓ 75<br>✓ 75<br>✓ 75 |
| 100013 | expert | How many days are there from 16 June 1970 to 27 June 2035? (Give the difference in days.) | 23752 | ✓ 23752<br>✓ 23752<br>✓ 23752 |
| 100015 | expert | Multiply 13374120 by 60170245, then add up the digits of the product. What is the sum? | 57 | ✓ 57<br>✓ 57<br>✓ 57 |
| 100017 | expert | How many times does the letter "h" appear in this string: cbcccffadbhebeabdfkdfeddaffeacafkkeheackadhhdghfbabfeeecfghahedheddhfhbkdgbccgdeedggkakcadfdedgkgaccbeaacdcgcafekhdeffafdcghdgkkhhddbkgachfgaffacagakbdafghkakffcahbgkcdkhbgafdbabdfbkcadbdafkkcheckaaad | 19 | ✓ 19<br>✓ 19<br>✓ 19 |
| 100018 | expert | What is the remainder when 29168 to the power 360958652 is divided by 664974? | 24706 | ✓ 24706<br>✓ 24706<br>✓ 24706 |
| 100019 | expert | Start at 44810842. If the number is even, halve it; if it is odd, multiply by 3 and add 1. Let S be the number of steps to reach 1. What is the smallest prime number greater than S × 100? | 11113 | ✓ 11113<br>✓ 11113<br>✓ 11113 |
| 100020 | expert | Write this string backwards: enginevelvetmagnetticketoysterforestyogurtcandle | eldnactrugoytserofretsyotekcittengamtevlevenigne | ✓ eldnactrugoytserofretsyotekcittengamtevlevenigne<br>✓ eldnactrugoytserofretsyotekcittengamtevlevenigne<br>✓ eldnactrugoytserofretsyotekcittengamtevlevenigne |
