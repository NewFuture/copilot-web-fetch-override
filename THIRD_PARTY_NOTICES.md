# Third-party notices

The bundled `extension.mjs` includes the following packages:

| Package | Version | License | Copyright/author notice |
| --- | --- | --- | --- |
| @mozilla/readability | 0.6.0 | Apache-2.0 | Copyright 2010 Arc90 Inc |
| linkedom | 0.18.13 | ISC | Copyright 2021 Andrea Giammarchi, @WebReflection |
| node-html-markdown | 2.0.0 | MIT | Ron S. and contributors |
| node-html-parser | 6.1.13 | MIT | Copyright 2019 Tao Qiufeng |
| css-select | 5.2.2, 7.0.0 | BSD-2-Clause | Copyright Felix Böhm |
| boolbase | 1.0.0, 2.0.0 | ISC | Felix Boehm |
| css-what | 6.2.2, 8.0.0 | BSD-2-Clause | Copyright Felix Böhm |
| cssom | 0.5.0 | MIT | Copyright Nikita Vasilyev |
| domhandler | 5.0.3, 6.0.1 | BSD-2-Clause | Copyright Felix Böhm |
| domelementtype | 2.3.0, 3.0.0 | BSD-2-Clause | Copyright Felix Böhm |
| domutils | 3.2.2, 4.0.2 | BSD-2-Clause | Copyright Felix Böhm |
| dom-serializer | 2.0.0, 3.1.1 | MIT | Copyright 2014 The cheeriojs contributors |
| entities | 4.5.0, 7.0.1, 8.0.0 | BSD-2-Clause | Copyright Felix Böhm |
| he | 1.2.0 | MIT | Copyright Mathias Bynens |
| html-escaper | 3.0.3 | MIT | Copyright 2017-present Andrea Giammarchi |
| htmlparser2 | 10.1.0 | MIT | Copyright 2010, 2011 Chris Winberry |
| nth-check | 2.1.1, 3.0.1 | BSD-2-Clause | Copyright Felix Böhm |
| uhyphen | 0.2.0 | ISC | Copyright 2020 Andrea Giammarchi, @WebReflection |

The build uses esbuild 0.28.1 under the MIT License, Copyright 2020 Evan
Wallace. esbuild itself is not included in the runtime bundle.

## Bundled patches

The build applies two narrow, fail-closed patches in
`scripts/patch-dependencies.mjs` before bundling:

- `node-html-parser` uses an unambiguous attribute-matching expression to avoid
  exponential regular-expression backtracking on untrusted HTML.
- `node-html-markdown` escapes every pipe in a Markdown table cell instead of
  only the first pipe. Backslashes have already been escaped by its text visitor
  before table post-processing.
- `@mozilla/readability` removes `javascript:`, `data:`, and `vbscript:` links
  before converting untrusted page content to Markdown.

The script verifies the exact upstream source before changing it and fails the
build when the expected version no longer matches.

## Apache License 2.0 notice

Copyright 2010 Arc90 Inc

Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at:

<http://www.apache.org/licenses/LICENSE-2.0>

Unless required by applicable law or agreed to in writing, software distributed
under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
CONDITIONS OF ANY KIND, either express or implied. See the License for the
specific language governing permissions and limitations under the License.

## MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The applicable copyright notice above and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## BSD 2-Clause License

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the applicable copyright notice
   above, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the applicable copyright
   notice above, this list of conditions and the following disclaimer in the
   documentation and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

## ISC License

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the applicable copyright
notice above and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
