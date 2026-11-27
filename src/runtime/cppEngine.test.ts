import test from 'node:test';
import assert from 'node:assert/strict';
import { CODE_TEMPLATES, DEFAULT_CODE } from '../data/templates';
import { decodeUtf8 } from '../vfs/vfsHelpers';
import { BrowserCppSession, compileInBrowser } from './cppEngine';

function runWithInputs(
  code: string,
  language: 'cpp' | 'c',
  inputs: string[],
  sendEofAfter = true
): Promise<{ stdout: string; stderr: string; exitCode: number | null; reason?: string }> {
  const compiled = compileInBrowser(code, language);
  assert.equal(compiled.ok, true, `Expected compile success, got: ${compiled.rawCompilerOutput}`);

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const session = new BrowserCppSession(compiled.program!, {
      onStdout: (chunk) => {
        stdout += chunk;
      },
      onStderr: (chunk) => {
        stderr += chunk;
      },
      onExit: ({ code: exitCode, reason }) => {
        resolve({ stdout, stderr, exitCode, reason });
      },
    });

    for (const line of inputs) {
      session.writeStdin(`${line}\n`);
    }
    if (sendEofAfter) {
      session.sendEof();
    }
  });
}

test('runs default C++ interactive cin/cout template accurately', async () => {
  const res = await runWithInputs(DEFAULT_CODE.cpp, 'cpp', ['17 25']);
  assert.equal(res.exitCode, 0);
  assert.match(res.stdout, /Введите два числа через пробел:/);
  assert.match(res.stdout, /Сумма: 42/);
  assert.match(res.stdout, /Произведение: 425/);
});

test('runs default C scanf/printf template accurately', async () => {
  const res = await runWithInputs(DEFAULT_CODE.c, 'c', ['9 6']);
  assert.equal(res.exitCode, 0);
  assert.match(res.stdout, /Сумма: 15/);
  assert.match(res.stdout, /Произведение: 54/);
});

test('runs user pointer + new int[n] + arr + i + %p program from iPad screenshot', async () => {
  const userCode = `#include <stdio.h>

void fillAndPrint(int *arr, int n) {
    for (int i = 0; i < n; i += 1) {
        printf("Введи элемент [%d]: ", i);
        scanf("%d", arr + i);
    }

    printf("\\nАдрес массива: %p\\n", arr);
    for (int i = 0; i < n; i += 1) {
        printf("arr[%d] = %d (адрес: %p)\\n", i, arr[i], arr + i);
    }
}

int main() {
    int n;
    printf("Проверка ввода. Введи размер массива (например, 3): ");
    scanf("%d", &n);

    int *d1 = new int[n];
    fillAndPrint(d1, n);
    delete[] d1;

    printf("\\nКомпилятор работает отлично!\\n");
    return 0;
}`;

  const res = await runWithInputs(userCode, 'cpp', ['3', '10', '20', '30']);
  assert.equal(res.exitCode, 0);
  assert.equal(res.stderr, '');
  assert.match(res.stdout, /Адрес массива: 0x[0-9a-f]+/);
  assert.match(res.stdout, /arr\[0\] = 10 \(адрес: 0x[0-9a-f]+\)/);
  assert.match(res.stdout, /arr\[2\] = 30 \(адрес: 0x[0-9a-f]+\)/);
  assert.match(res.stdout, /Компилятор работает отлично!/);
});

test('runs vector sort template and C malloc/free stats template', async () => {
  const sortTpl = CODE_TEMPLATES.find((t) => t.id === 'cpp-array-sort')!;
  const sortRes = await runWithInputs(sortTpl.code, 'cpp', ['4', '40 10 30 20']);
  assert.equal(sortRes.exitCode, 0);
  assert.match(sortRes.stdout, /Отсортировано: 10 20 30 40/);
  assert.match(sortRes.stdout, /Минимум: 10, Максимум: 40/);

  const statsTpl = CODE_TEMPLATES.find((t) => t.id === 'c-stats')!;
  const statsRes = await runWithInputs(statsTpl.code, 'c', ['3', '2.5 3.5 6.0']);
  assert.equal(statsRes.exitCode, 0);
  assert.match(statsRes.stdout, /Сумма: 12\.00/);
  assert.match(statsRes.stdout, /Среднее: 4\.00/);
});

test('runs interactive calculator loop until EOF cleanly', async () => {
  const calcTpl = CODE_TEMPLATES.find((t) => t.id === 'cpp-calculator')!;
  const res = await runWithInputs(calcTpl.code, 'cpp', ['12.5 * 4', '10 / 0', '7 + 8'], true);
  assert.equal(res.exitCode, 0);
  assert.match(res.stdout, /= 50/);
  assert.match(res.stdout, /Ошибка: деление на ноль/);
  assert.match(res.stdout, /= 15/);
});

test('reports syntax error with exact line, column, and caret preview', () => {
  const broken = `#include <stdio.h>
int main(void) {
    int x = 10
    printf("%d\\n", x);
    return 0;
}`;
  const res = compileInBrowser(broken, 'c');
  assert.equal(res.ok, false);
  assert.equal(res.diagnostics.length, 1);
  assert.equal(res.diagnostics[0].line, 4);
  assert.equal(res.diagnostics[0].severity, 'error');
  assert.match(res.diagnostics[0].message, /expected ';'/);
  assert.ok(res.diagnostics[0].caretLine?.includes('^'));
});

test('stops infinite loops cleanly via session.stop()', async () => {
  const compiled = compileInBrowser('int main() { while (true) {} return 0; }', 'cpp');
  assert.equal(compiled.ok, true);

  const result = await new Promise<{ exitCode: number | null; reason?: string }>((resolve) => {
    const session = new BrowserCppSession(compiled.program!, {
      onStdout: () => {},
      onStderr: () => {},
      onExit: ({ code, reason }) => resolve({ exitCode: code, reason }),
    });
    setTimeout(() => session.stop(), 15);
  });

  assert.equal(result.exitCode, null);
  assert.match(result.reason ?? '', /Остановлено/);
});

test('stops cleanly while blocked waiting on interactive stdin', async () => {
  const compiled = compileInBrowser(
    '#include <iostream>\nint main() { int x; std::cout << "Enter: " << std::flush; std::cin >> x; return 0; }',
    'cpp'
  );
  assert.equal(compiled.ok, true);

  let waited = false;
  let stdout = '';
  const result = await new Promise<{ exitCode: number | null; reason?: string }>((resolve) => {
    const session = new BrowserCppSession(compiled.program!, {
      onStdout: (chunk) => {
        stdout += chunk;
      },
      onStderr: () => {},
      onWaitingForInput: () => {
        waited = true;
      },
      onExit: ({ code, reason }) => resolve({ exitCode: code, reason }),
    });
    setTimeout(() => session.stop(), 20);
  });

  assert.equal(stdout, 'Enter: ');
  assert.equal(waited, true);
  assert.equal(result.exitCode, null);
  assert.match(result.reason ?? '', /Остановлено/);
});

// Verification Gate #1: Glued tokens "12.5*.5" and "12+34"
test('[Gate 1] non-greedy numeric parsing handles glued tokens 12.5*.5 and 12+34 and rollback on invalid input', async () => {
  const code = `#include <iostream>
using namespace std;
int main() {
    double a, b;
    char op;
    cin >> a >> op >> b;
    cout << a << "|" << op << "|" << b << "\\n";

    int x, y;
    char op2;
    cin >> x >> op2 >> y;
    cout << x << "|" << op2 << "|" << y << "\\n";

    int bad = 99;
    if (!(cin >> bad)) {
        cout << "FAIL\\n";
        cin.clear();
        string word;
        cin >> word;
        cout << "RECOVERED:" << word << "\\n";
    }
    return 0;
}`;
  const res = await runWithInputs(code, 'cpp', ['12.5*.5', '12+34', 'hello']);
  assert.equal(res.exitCode, 0, res.stderr);
  assert.equal(res.stdout, '12.5|*|0.5\n12|+|34\nFAIL\nRECOVERED:hello\n');
});

// Verification Gate #2: cin >> age + getline(cin >> ws, name) with Cyrillic (both batched & async)
test('[Gate 2] getline(cin >> ws, name) reads UTF-8 Cyrillic line after numeric cin >> age', async () => {
  const code = `#include <iostream>
#include <string>
using namespace std;
int main() {
    int age;
    string name;
    cout << "Age: " << flush;
    cin >> age;
    cout << "Name: " << flush;
    getline(cin >> ws, name);
    cout << age << ":" << name << endl;
    return 0;
}`;
  // Test interactive async delivery where second line arrives after cin >> ws blocks
  const compiled = compileInBrowser(code, 'cpp');
  assert.equal(compiled.ok, true, compiled.rawCompilerOutput);

  let stdout = '';
  let stderr = '';
  const exitCode = await new Promise<number | null>((resolve) => {
    const session = new BrowserCppSession(compiled.program!, {
      onStdout: (t) => {
        stdout += t;
      },
      onStderr: (t) => {
        stderr += t;
      },
      onExit: ({ code: c }) => resolve(c),
    });
    setTimeout(() => session.writeStdin('25\n'), 10);
    setTimeout(() => session.writeStdin('Иван Иванов\n'), 35);
  });

  assert.equal(exitCode, 0, stderr);
  assert.equal(stdout, 'Age: Name: 25:Иван Иванов\n');
});

// Verification Gate #3: putback, unget, peek
test('[Gate 3] cin.putback, cin.unget, and cin.peek navigate stream cursor accurately', async () => {
  const code = `#include <iostream>
using namespace std;
int main() {
    char c;
    int x;
    cin >> c;
    cin.putback(c);
    int p = cin.peek();
    cin >> x;
    cout << c << "|" << static_cast<char>(p) << "|" << x << "\\n";

    char a = static_cast<char>(cin.get());
    cin.unget();
    char b = static_cast<char>(cin.get());
    cout << (a == b ? "SAME" : "DIFF") << "\\n";
    return 0;
}`;
  const res = await runWithInputs(code, 'cpp', ['42', 'Z']);
  assert.equal(res.exitCode, 0, res.stderr);
  assert.equal(res.stdout, '4|4|42\nSAME\n');
});

// Verification Gate #4: std::numeric_limits<std::streamsize>::max() with extra parens & cin.ignore
test('[Gate 4] cin.clear() and cin.ignore((std::numeric_limits<std::streamsize>::max)(), \'\\n\') clear garbage', async () => {
  const code = `#include <iostream>
#include <limits>
using namespace std;
int main() {
    int n = 0;
    while (!(cin >> n)) {
        cout << "BAD\\n";
        cin.clear();
        cin.ignore((std::numeric_limits<std::streamsize>::max)(), '\\n');
    }
    cout << "OK:" << n << "\\n";
    return 0;
}`;
  const res = await runWithInputs(code, 'cpp', ['abc def', '+++', '77']);
  assert.equal(res.exitCode, 0, res.stderr);
  assert.equal(res.stdout, 'BAD\nBAD\nOK:77\n');
});

// Verification Gate #5: istringstream, ostringstream, vector<string>
test('[Gate 5] std::istringstream, std::ostringstream, and std::vector<std::string> work together', async () => {
  const code = `#include <iostream>
#include <sstream>
#include <string>
#include <vector>
#include <iomanip>
using namespace std;
int main() {
    istringstream iss("10 + 20");
    int a, b;
    char op;
    iss >> a >> op >> b;

    ostringstream oss;
    oss << a << " " << op << " " << b << " = " << fixed << setprecision(1) << static_cast<double>(a + b);

    vector<string> results;
    results.push_back(oss.str());

    istringstream lines("first line\\nsecond line");
    string ln;
    while (getline(lines, ln)) {
        results.push_back(ln);
    }

    for (const auto& item : results) {
        cout << item << "\\n";
    }
    return 0;
}`;
  const res = await runWithInputs(code, 'cpp', []);
  assert.equal(res.exitCode, 0, res.stderr);
  assert.equal(res.stdout, '10 + 20 = 30.0\nfirst line\nsecond line\n');
});

// Verification Gate #6: Recursive descent Parser class with map<string, double>&, initializer list, std::stod
test('[Gate 6] recursive class Parser with map reference, member initializer list, and std::stod evaluates 2 + 3 * (4 - 1) = 11', async () => {
  const code = `#include <iostream>
#include <string>
#include <map>
#include <cctype>
#include <stdexcept>
using namespace std;

class Parser {
    const string& src;
    map<string, double>& vars;
    size_t pos;

    void skipWs() {
        while (pos < src.size() && isspace(static_cast<unsigned char>(src[pos]))) {
            pos++;
        }
    }

    double parseFactor() {
        skipWs();
        if (pos < src.size() && src[pos] == '(') {
            pos++;
            double v = parseExpr();
            skipWs();
            if (pos < src.size() && src[pos] == ')') pos++;
            return v;
        }
        if (pos < src.size() && isalpha(static_cast<unsigned char>(src[pos]))) {
            size_t start = pos;
            while (pos < src.size() && isalnum(static_cast<unsigned char>(src[pos]))) pos++;
            string name = src.substr(start, pos - start);
            return vars[name];
        }
        size_t consumed = 0;
        double num = stod(src.substr(pos), &consumed);
        pos += consumed;
        return num;
    }

    double parseTerm() {
        double left = parseFactor();
        while (true) {
            skipWs();
            if (pos < src.size() && (src[pos] == '*' || src[pos] == '/')) {
                char op = src[pos++];
                double right = parseFactor();
                left = (op == '*') ? (left * right) : (left / right);
            } else {
                break;
            }
        }
        return left;
    }

public:
    Parser(const string& s, map<string, double>& v) : src(s), vars(v), pos(0) {}

    double parseExpr() {
        double left = parseTerm();
        while (true) {
            skipWs();
            if (pos < src.size() && (src[pos] == '+' || src[pos] == '-')) {
                char op = src[pos++];
                double right = parseTerm();
                left = (op == '+') ? (left + right) : (left - right);
            } else {
                break;
            }
        }
        return left;
    }
};

int main() {
    map<string, double> vars;
    vars["x"] = 4.0;
    string expr1 = "2 + 3 * (4 - 1)";
    Parser p1(expr1, vars);
    cout << p1.parseExpr() << "\\n";

    string expr2 = "2 + 3 * (x - 1)";
    Parser p2(expr2, vars);
    cout << p2.parseExpr() << "\\n";
    return 0;
}`;
  const res = await runWithInputs(code, 'cpp', []);
  assert.equal(res.exitCode, 0, res.stderr);
  assert.equal(res.stdout, '11\n11\n');
});

test('supports unified C stdio + C++ iostream, fstream Virtual FS with RAII close, string ops, map/set, try/catch, and atomic static reset', async () => {
  const code = `#include <iostream>
#include <cstdio>
#include <fstream>
#include <string>
#include <map>
#include <set>
#include <stdexcept>
using namespace std;

int nextCounter() {
    static int counter = 0;
    counter++;
    return counter;
}

int main() {
    // 1. Unified scanf + cin over same buffer
    int a, b;
    scanf("%d", &a);
    cin >> b;
    printf("SUM=%d\\n", a + b);

    // 2. Virtual FS ofstream/ifstream with RAII scope close
    {
        ofstream out("data.txt");
        out << "hello file " << 42 << "\\n";
    }
    ifstream in("data.txt");
    string line;
    getline(in, line);
    cout << "FILE=" << line << "\\n";

    // 3. std::string + char, char + string, [] mutation, npos
    string s = "ab";
    s = s + 'c';
    s = '>' + s;
    s[1] = 'A';
    cout << "STR=" << s << " NPOS=" << (s.find("zzz") == string::npos ? 1 : 0) << "\\n";

    // 4. map structured bindings & set
    map<string, int> m;
    m["b"] = 2;
    m["a"] = 1;
    for (const auto& [k, v] : m) {
        cout << k << "=" << v << " ";
    }
    cout << "\\n";

    set<int> st;
    st.insert(3);
    st.insert(1);
    st.insert(3);
    cout << "SET=" << st.size() << "\\n";

    // 5. try/catch/throw
    try {
        throw runtime_error("boom");
    } catch (const exception& e) {
        cout << "CAUGHT=" << e.what() << "\\n";
    }

    // 6. static local counter
    cout << "STATIC=" << nextCounter() << "," << nextCounter() << "\\n";
    return 0;
}`;

  const run1 = await runWithInputs(code, 'cpp', ['10 20']);
  assert.equal(run1.exitCode, 0, run1.stderr);
  assert.equal(
    run1.stdout,
    'SUM=30\nFILE=hello file 42\nSTR=>Abc NPOS=1\na=1 b=2 \nSET=2\nCAUGHT=boom\nSTATIC=1,2\n'
  );

  // Atomic reset check: second run must start static counter fresh at 1,2 and clean Virtual FS
  const run2 = await runWithInputs(code, 'cpp', ['3 4']);
  assert.equal(run2.exitCode, 0, run2.stderr);
  assert.match(run2.stdout, /SUM=7/);
  assert.match(run2.stdout, /STATIC=1,2/);
});

test('prevents browser crash on infinite recursion with stack overflow guard', async () => {
  const code = `int boom(int n) { return boom(n + 1); }
int main() { return boom(0); }`;
  const res = await runWithInputs(code, 'cpp', []);
  assert.equal(res.exitCode, 1);
  assert.match(res.stderr, /Stack overflow/i);
});

test('bidirectional <fstream> mounts initial VFS, syncs live on flush/close/remove, and supports in/out/app/trunc/binary modes', async () => {
  const code = `#include <fstream>
#include <iostream>
#include <cstdio>
#include <string>
using namespace std;

int main() {
    // 1. Missing file check with ifstream
    ifstream missing("does_not_exist.txt");
    cout << "MISS_OPEN=" << (missing.is_open() ? 1 : 0) << " FAIL=" << (missing.fail() ? 1 : 0) << "\\n";

    // 2. Read mounted input.txt with >> and getline + eof
    ifstream in("./input.txt");
    int a = 0, b = 0;
    in >> a >> b;
    string label;
    getline(in >> ws, label);
    string extra;
    getline(in, extra);
    cout << "READ=" << (a + b) << "|" << label << "|EOF=" << (in.eof() ? 1 : 0) << "\\n";
    in.close();

    // 3. Write output.txt and flush mid-run
    ofstream out("output.txt");
    out << "SUM=" << (a + b) << "\\n" << flush;
    out << "LABEL=" << label << "\\n";
    out.close();

    // 4. Append mode on existing log.txt
    ofstream log("log.txt", ios::out | ios::app);
    log << "second\\n";
    log.close();

    // 5. Binary fstream write + read + gcount + seekg
    fstream bin("data.bin", ios::in | ios::out | ios::trunc | ios::binary);
    char rawOut[4] = {'A', 'B', 'C', 'D'};
    bin.write(rawOut, 4);
    bin.flush();
    bin.seekg(1, ios::beg);
    char rawIn[2] = {0, 0};
    bin.read(rawIn, 2);
    cout << "BIN=" << rawIn[0] << rawIn[1] << "|GCOUNT=" << bin.gcount() << "\\n";
    bin.close();

    // 6. Delete temp.txt via std::remove
    int rmRes = remove("temp.txt");
    cout << "RM=" << rmRes << "\\n";
    return 0;
}`;

  const initialFiles = {
    'input.txt': '15 27\nПривет мир\n',
    'log.txt': 'first\n',
    'temp.txt': 'to be removed',
  };

  const compiled = compileInBrowser(code, 'cpp', initialFiles);
  assert.equal(compiled.ok, true, compiled.rawCompilerOutput);

  const liveEvents: Array<{ path: string; action: string }> = [];
  let finalSnapshot: Record<string, Uint8Array> = {};
  let stdout = '';
  let stderr = '';

  const exitCode = await new Promise<number | null>((resolve) => {
    const session = new BrowserCppSession(compiled.program!, {
      initialFiles,
      onStdout: (chunk) => {
        stdout += chunk;
      },
      onStderr: (chunk) => {
        stderr += chunk;
      },
      onVfsChange: (event) => {
        liveEvents.push({ path: event.path, action: event.action });
      },
      onVfsFinalSync: (snap) => {
        finalSnapshot = snap;
      },
      onExit: ({ code: c }) => resolve(c),
    });
    session.sendEof();
  });

  assert.equal(exitCode, 0, stderr);
  assert.equal(
    stdout,
    'MISS_OPEN=0 FAIL=1\nREAD=42|Привет мир|EOF=1\nBIN=BC|GCOUNT=2\nRM=0\n'
  );
  assert.equal(decodeUtf8(finalSnapshot['output.txt']), 'SUM=42\nLABEL=Привет мир\n');
  assert.equal(decodeUtf8(finalSnapshot['log.txt']), 'first\nsecond\n');
  assert.deepEqual(Array.from(finalSnapshot['data.bin']), [65, 66, 67, 68]);
  assert.equal('temp.txt' in finalSnapshot, false);
  assert.ok(liveEvents.some((e) => e.path === 'output.txt' && e.action === 'create'));
  assert.ok(liveEvents.some((e) => e.path === 'output.txt' && e.action === 'modify'));
  assert.ok(liveEvents.some((e) => e.path === 'temp.txt' && e.action === 'delete'));
});

test('resolves local quoted #include headers from Virtual Workspace files', async () => {
  const virtualFiles = {
    'helper.h': `#pragma once
int triple(int x) {
    return x * 3;
}
`,
  };
  const code = `#include <iostream>
#include "helper.h"
using namespace std;
int main() {
    cout << triple(14) << "\\n";
    return 0;
}`;

  const compiled = compileInBrowser(code, 'cpp', virtualFiles);
  assert.equal(compiled.ok, true, compiled.rawCompilerOutput);

  let stdout = '';
  let stderr = '';
  const exitCode = await new Promise<number | null>((resolve) => {
    const session = new BrowserCppSession(compiled.program!, {
      initialFiles: virtualFiles,
      onStdout: (c) => {
        stdout += c;
      },
      onStderr: (c) => {
        stderr += c;
      },
      onExit: ({ code: c }) => resolve(c),
    });
    session.sendEof();
  });

  assert.equal(exitCode, 0, stderr);
  assert.equal(stdout, '42\n');
});

test('C <stdio.h> FILE* binary struct/array fwrite/fread, fseek/ftell/rewind/feof/clearerr, NULL check, and auto-flush unclosed FILE*', async () => {
  const code = `#include <stdio.h>

struct Item {
    int id;
    double price;
    float weight;
    char tag[8];
    char active;
};

int main(void) {
    // Missing file in "rb" mode must return NULL
    FILE* missing = fopen("no_such_file.bin", "rb");
    printf("MISS=%d\\n", (missing == NULL && !missing) ? 1 : 0);

    // Exact serialized sizeof(struct Item) = 4 + 8 + 4 + 8 + 1 = 25 bytes
    struct Item items[2] = {
        {10, 19.75, 2.5f, "Pen", 1},
        {20, 42.125, 0.5f, "Book", 0}
    };
    printf("SZ=%zu:%zu\\n", sizeof(struct Item), sizeof(items));

    FILE* wf = fopen("items.bin", "wb");
    if (wf == NULL) return 1;
    size_t nw = fwrite(items, sizeof(struct Item), 2, wf);
    int rc = fclose(wf);
    printf("W=%zu RC=%d\\n", nw, rc);

    // Open in "rb", seek to end/cur/set, read back
    FILE* rf = fopen("items.bin", "rb");
    if (!rf) return 1;
    fseek(rf, 0, SEEK_END);
    long totalBytes = ftell(rf);
    // Seek directly to 2nd record via SEEK_SET
    fseek(rf, (long)sizeof(struct Item), SEEK_SET);
    struct Item second;
    size_t nr1 = fread(&second, sizeof(struct Item), 1, rf);
    printf("LEN=%ld NR1=%zu SECOND=%d|%.3f|%.1f|%s|%d\\n",
           totalBytes, nr1, second.id, second.price, second.weight, second.tag, (int)second.active);

    // Reading past EOF triggers feof; clearerr resets it; rewind returns to 0
    struct Item extra;
    size_t nrEof = fread(&extra, sizeof(struct Item), 1, rf);
    int eofBefore = feof(rf);
    clearerr(rf);
    int eofAfter = feof(rf);
    rewind(rf);
    long posAfterRewind = ftell(rf);

    struct Item loaded[2];
    size_t nrAll = fread(loaded, sizeof(struct Item), 2, rf);
    fclose(rf);
    printf("EOF=%zu:%d:%d:%ld ALL=%zu FIRST=%d|%s\\n",
           nrEof, eofBefore, eofAfter, posAfterRewind, nrAll, loaded[0].id, loaded[0].tag);

    // Leave a dirty FILE* intentionally unclosed — runtime must auto-flush it on main() exit!
    FILE* dirty = fopen("unclosed.bin", "wb");
    int magic = 0x01020304;
    fwrite(&magic, sizeof(int), 1, dirty);
    return 0;
}`;

  const compiled = compileInBrowser(code, 'c');
  assert.equal(compiled.ok, true, compiled.rawCompilerOutput);

  let finalSnapshot: Record<string, Uint8Array> = {};
  let stdout = '';
  let stderr = '';

  const exitCode = await new Promise<number | null>((resolve) => {
    const session = new BrowserCppSession(compiled.program!, {
      onStdout: (c) => {
        stdout += c;
      },
      onStderr: (c) => {
        stderr += c;
      },
      onVfsFinalSync: (snap) => {
        finalSnapshot = snap;
      },
      onExit: ({ code: c }) => resolve(c),
    });
    session.sendEof();
  });

  assert.equal(exitCode, 0, stderr);
  assert.equal(
    stdout,
    'MISS=1\nSZ=25:50\nW=2 RC=0\nLEN=50 NR1=1 SECOND=20|42.125|0.5|Book|0\nEOF=0:1:0:0 ALL=2 FIRST=10|Pen\n'
  );

  // Raw Uint8Array must hold exact 50 bytes including embedded \0 null bytes!
  const itemsBin = finalSnapshot['items.bin'];
  assert.ok(itemsBin instanceof Uint8Array);
  assert.equal(itemsBin.byteLength, 50);
  assert.equal(itemsBin.includes(0), true);

  // Verify little-endian DataView encoding of record 0 directly in VFS Uint8Array
  const dv = new DataView(itemsBin.buffer, itemsBin.byteOffset, itemsBin.byteLength);
  assert.equal(dv.getInt32(0, true), 10);
  assert.equal(dv.getFloat64(4, true), 19.75);
  assert.equal(dv.getFloat32(12, true), 2.5);
  assert.equal(itemsBin[16], 'P'.charCodeAt(0));
  assert.equal(itemsBin[17], 'e'.charCodeAt(0));
  assert.equal(itemsBin[18], 'n'.charCodeAt(0));
  assert.equal(itemsBin[19], 0); // null terminator preserved!
  assert.equal(itemsBin[24], 1);

  // Auto-flushed unclosed FILE* must be present with exact little-endian bytes [04, 03, 02, 01]
  const unclosedBin = finalSnapshot['unclosed.bin'];
  assert.ok(unclosedBin instanceof Uint8Array);
  assert.deepEqual(Array.from(unclosedBin), [0x04, 0x03, 0x02, 0x01]);
});

test('C++ <cstdio> with std:: namespace supports fprintf, fscanf, fgets, fputs, fgetc/fputc, modes a/r+/w+/a+, rename, and remove', async () => {
  const code = `#include <cstdio>
#include <iostream>
using namespace std;

int main() {
    // 1. std::fopen("w") + std::fprintf + std::fputs + std::fputc
    std::FILE* f = std::fopen("notes.txt", "w");
    if (f == nullptr) return 1;
    std::fprintf(f, "%d %.2f %s\\n", 42, 3.5, "alpha");
    std::fputs("second line\\n", f);
    std::fputc('Z', f);
    std::fputc('\\n', f);
    std::fclose(f);

    // 2. Append mode "a"
    std::FILE* fa = std::fopen("notes.txt", "a");
    std::fputs("appended\\n", fa);
    std::fclose(fa);

    // 3. Read back with std::fscanf, std::fgets, std::fgetc + std::ungetc
    std::FILE* fr = std::fopen("notes.txt", "r");
    int num = 0;
    double dbl = 0.0;
    char word[16];
    int matched = std::fscanf(fr, "%d %lf %15s", &num, &dbl, word);
    int nl = std::fgetc(fr); // consume trailing newline
    char line2[32];
    std::fgets(line2, 32, fr);
    int ch = std::fgetc(fr);
    std::ungetc(ch, fr);
    int chAgain = std::getc(fr);
    std::fclose(fr);

    cout << "SCAN=" << matched << ":" << num << ":" << dbl << ":" << word << "|NL=" << (nl == '\\n' ? 1 : 0) << "\\n";
    cout << "LINE2=" << line2;
    cout << "CH=" << static_cast<char>(ch) << static_cast<char>(chAgain) << "\\n";

    // 4. Read/write update mode "r+" with fseek + SEEK_CUR
    std::FILE* rw = std::fopen("notes.txt", "r+");
    std::fseek(rw, 0, SEEK_SET);
    std::fputc('9', rw);
    std::fseek(rw, 0, SEEK_CUR);
    int secondChar = std::fgetc(rw);
    std::fclose(rw);
    cout << "RW2=" << static_cast<char>(secondChar) << "\\n";

    // 5. w+ create & read back in same handle
    std::FILE* wp = std::fopen("temp_wp.txt", "w+");
    std::fputs("hello_wp", wp);
    std::rewind(wp);
    char buf[16];
    std::fgets(buf, 16, wp);
    std::fclose(wp);
    cout << "WP=" << buf << "\\n";

    // 6. std::rename & std::remove
    int ren = std::rename("temp_wp.txt", "renamed.txt");
    int rem = std::remove("obsolete.txt");
    cout << "REN=" << ren << " REM=" << rem << "\\n";
    return 0;
}`;

  const initialFiles = {
    'obsolete.txt': 'delete me',
  };
  const compiled = compileInBrowser(code, 'cpp', initialFiles);
  assert.equal(compiled.ok, true, compiled.rawCompilerOutput);

  let finalSnapshot: Record<string, Uint8Array> = {};
  let stdout = '';
  let stderr = '';

  const exitCode = await new Promise<number | null>((resolve) => {
    const session = new BrowserCppSession(compiled.program!, {
      initialFiles,
      onStdout: (c) => {
        stdout += c;
      },
      onStderr: (c) => {
        stderr += c;
      },
      onVfsFinalSync: (snap) => {
        finalSnapshot = snap;
      },
      onExit: ({ code: c }) => resolve(c),
    });
    session.sendEof();
  });

  assert.equal(exitCode, 0, stderr);
  assert.equal(
    stdout,
    'SCAN=3:42:3.5:alpha|NL=1\nLINE2=second line\nCH=ZZ\nRW2=2\nWP=hello_wp\nREN=0 REM=0\n'
  );
  assert.equal(decodeUtf8(finalSnapshot['renamed.txt']), 'hello_wp');
  assert.equal('temp_wp.txt' in finalSnapshot, false);
  assert.equal('obsolete.txt' in finalSnapshot, false);
  assert.equal(decodeUtf8(finalSnapshot['notes.txt']).startsWith('92 3.50 alpha\n'), true);
});

test('C++ std::ios::binary .write()/.read() with reinterpret_cast<char*> serializes primitives, arrays, and structs cleanly', async () => {
  const code = `#include <fstream>
#include <iostream>
using namespace std;

struct Sensor {
    int id;
    double temp;
    bool ok;
    char code[6];
};

int main() {
    int count = 2;
    double bias = -1.25;
    Sensor list[2] = {
        {7, 23.5, true, "S01"},
        {8, -4.75, false, "S02"}
    };

    ofstream out("sensors.bin", ios::out | ios::binary);
    out.write(reinterpret_cast<char*>(&count), sizeof(count));
    out.write(reinterpret_cast<char*>(&bias), sizeof(bias));
    out.write(reinterpret_cast<char*>(list), sizeof(list));
    out.close();

    ifstream in("sensors.bin", ios::in | ios::binary);
    int rCount = 0;
    double rBias = 0.0;
    in.read(reinterpret_cast<char*>(&rCount), sizeof(rCount));
    in.read(reinterpret_cast<char*>(&rBias), sizeof(rBias));
    cout << "HDR=" << rCount << "|" << rBias << "|SZ=" << sizeof(Sensor) << "\\n";

    Sensor s;
    while (in.read(reinterpret_cast<char*>(&s), sizeof(Sensor))) {
        cout << s.id << ":" << s.temp << ":" << (s.ok ? 1 : 0) << ":" << s.code << "|G=" << in.gcount() << "\\n";
    }
    cout << "EOF=" << (in.eof() ? 1 : 0) << "\\n";
    in.close();
    return 0;
}`;

  const compiled = compileInBrowser(code, 'cpp');
  assert.equal(compiled.ok, true, compiled.rawCompilerOutput);

  let finalSnapshot: Record<string, Uint8Array> = {};
  let stdout = '';
  let stderr = '';

  const exitCode = await new Promise<number | null>((resolve) => {
    const session = new BrowserCppSession(compiled.program!, {
      onStdout: (c) => {
        stdout += c;
      },
      onStderr: (c) => {
        stderr += c;
      },
      onVfsFinalSync: (snap) => {
        finalSnapshot = snap;
      },
      onExit: ({ code: c }) => resolve(c),
    });
    session.sendEof();
  });

  assert.equal(exitCode, 0, stderr);
  // sizeof(Sensor) = 4 + 8 + 1 + 6 = 19 bytes; total file = 4 + 8 + 2*19 = 50 bytes
  assert.equal(
    stdout,
    'HDR=2|-1.25|SZ=19\n7:23.5:1:S01|G=19\n8:-4.75:0:S02|G=19\nEOF=1\n'
  );
  const bin = finalSnapshot['sensors.bin'];
  assert.ok(bin instanceof Uint8Array);
  assert.equal(bin.byteLength, 50);
  assert.equal(bin.includes(0), true);
});

test('runs built-in binary templates (cpp-binary-fstream and c-binary-stdio) cleanly', async () => {
  const cppBinTpl = CODE_TEMPLATES.find((t) => t.id === 'cpp-binary-fstream')!;
  const cppRes = await runWithInputs(cppBinTpl.code, 'cpp', []);
  assert.equal(cppRes.exitCode, 0, cppRes.stderr);
  assert.match(cppRes.stdout, /sizeof\(Record\) = 24 Б/);
  assert.match(cppRes.stdout, /#101 Alice -> 98\.5/);
  assert.match(cppRes.stdout, /#102 Bob -> 87\.25/);

  const cBinTpl = CODE_TEMPLATES.find((t) => t.id === 'c-binary-stdio')!;
  const cRes = await runWithInputs(cBinTpl.code, 'c', []);
  assert.equal(cRes.exitCode, 0, cRes.stderr);
  assert.match(cRes.stdout, /Записано записей: 2 \(sizeof = 24 Б\)/);
  assert.match(cRes.stdout, /Размер файла: 48 Б, прочитано: 2/);
  assert.match(cRes.stdout, /\[1\] Notebook — 19\.99/);
  assert.match(cRes.stdout, /\[2\] Pencil — 4\.50/);
});

test('supports nested folder paths in <fstream> and <cstdio>, auto-creates parent dirs on write, and rejects opening directories', async () => {
  const code = `#include <cstdio>
#include <fstream>
#include <iostream>
#include <string>
using namespace std;

int main() {
    // 1. Opening a folder path must fail cleanly (NULL / failbit)
    FILE* dirF = fopen("lab7", "r");
    ifstream dirIn("lab7");
    FILE* emptyDirF = fopen("empty_dir", "r");
    cout << "DIRS=" << (dirF == NULL ? 1 : 0)
         << "|" << (dirIn.fail() ? 1 : 0)
         << "|" << (emptyDirF == NULL ? 1 : 0) << "\\n";

    // 2. Read nested file with backslash and dot-slash normalization
    ifstream in("./lab7\\\\input.txt");
    int x = 0;
    string tag;
    in >> x >> tag;
    in.close();
    cout << "IN=" << x << "|" << tag << "\\n";

    // 3. Write binary bytes (including 0x00 and 0xFF) into nested path
    FILE* wb = fopen("lab7/nested/out.bin", "wb");
    if (!wb) {
        cout << "WB_FAIL\\n";
        return 1;
    }
    unsigned char raw[4] = {0x00, 0x41, 0x7f, 0xff};
    fwrite(raw, 1, 4, wb);
    fclose(wb);

    // 4. Read back via normalized parent traversal path
    FILE* rb = fopen("lab7/nested/../nested/out.bin", "rb");
    unsigned char back[4] = {0, 0, 0, 0};
    size_t got = fread(back, 1, 4, rb);
    fclose(rb);
    cout << "BIN=" << got << "|" << (int)back[0] << "," << (int)back[1] << "," << (int)back[3] << "\\n";

    // 5. Write & rename across nested directories
    {
        ofstream out("lab7/temp.txt");
        out << "moved_ok";
    }
    int rn = rename("lab7/temp.txt", "archive/done.txt");
    cout << "RN=" << rn << "\\n";
    return 0;
}`;

  const compiled = compileInBrowser(code, 'cpp', { 'lab7/input.txt': '77 alpha\n' });
  assert.equal(compiled.ok, true, compiled.rawCompilerOutput);

  let finalSnapshot: Record<string, Uint8Array> = {};
  let stdout = '';
  let stderr = '';

  const exitCode = await new Promise<number | null>((resolve) => {
    const session = new BrowserCppSession(compiled.program!, {
      initialFiles: { 'lab7/input.txt': '77 alpha\n' },
      initialFolders: ['empty_dir', 'lab7'],
      onStdout: (c) => {
        stdout += c;
      },
      onStderr: (c) => {
        stderr += c;
      },
      onVfsFinalSync: (snap) => {
        finalSnapshot = snap;
      },
      onExit: ({ code: c }) => resolve(c),
    });
    session.sendEof();
  });

  assert.equal(exitCode, 0, stderr);
  assert.equal(stdout, 'DIRS=1|1|1\nIN=77|alpha\nBIN=4|0,65,255\nRN=0\n');
  assert.deepEqual(Array.from(finalSnapshot['lab7/nested/out.bin']), [0x00, 0x41, 0x7f, 0xff]);
  assert.equal(decodeUtf8(finalSnapshot['archive/done.txt']), 'moved_ok');
  assert.equal('lab7/temp.txt' in finalSnapshot, false);
});



