import type { CodeTemplate, Language } from '../types/compiler';

export const DEFAULT_CODE: Record<Language, string> = {
  cpp: `#include <iostream>
using namespace std;

int main() {
    int a, b;
    cout << "Введите два числа через пробел: ";
    if (cin >> a >> b) {
        cout << "Сумма: " << (a + b) << "\\n";
        cout << "Произведение: " << (a * b) << "\\n";
    }
    return 0;
}
`,
  c: `#include <stdio.h>

int main(void) {
    int a, b;
    printf("Введите два числа через пробел: ");
    if (scanf("%d %d", &a, &b) == 2) {
        printf("Сумма: %d\\n", a + b);
        printf("Произведение: %d\\n", a * b);
    }
    return 0;
}
`,
};

export const CODE_TEMPLATES: CodeTemplate[] = [
  {
    id: 'cpp-sum',
    language: 'cpp',
    title: 'Интерактивный ввод (cin)',
    description: 'Сложение и умножение двух чисел из консоли',
    code: DEFAULT_CODE.cpp,
  },
  {
    id: 'cpp-array-sort',
    language: 'cpp',
    title: 'Сортировка вектора',
    description: 'Ввод массива чисел, сортировка и поиск минимума/максимума',
    code: `#include <algorithm>
#include <iostream>
#include <vector>
using namespace std;

int main() {
    int n;
    cout << "Сколько чисел ввести? ";
    if (!(cin >> n) || n <= 0) {
        cout << "Нужно положительное число.\\n";
        return 0;
    }

    vector<int> nums(n);
    cout << "Введите " << n << " чисел: ";
    for (int i = 0; i < n; ++i) {
        cin >> nums[i];
    }

    sort(nums.begin(), nums.end());

    cout << "Отсортировано: ";
    for (int i = 0; i < n; ++i) {
        cout << nums[i] << (i + 1 < n ? " " : "\\n");
    }
    cout << "Минимум: " << nums.front() << ", Максимум: " << nums.back() << "\\n";
    return 0;
}
`,
  },
  {
    id: 'cpp-calculator',
    language: 'cpp',
    title: 'Интерактивный калькулятор',
    description: 'Многократный ввод выражений вида 12 * 4 в цикле',
    code: `#include <iostream>
using namespace std;

int main() {
    double a, b;
    char op;

    cout << "Калькулятор (например: 12.5 * 4). Для выхода нажмите Ctrl+D.\\n";
    while (true) {
        cout << "> ";
        if (!(cin >> a >> op >> b)) break;

        switch (op) {
            case '+': cout << "= " << (a + b) << "\\n"; break;
            case '-': cout << "= " << (a - b) << "\\n"; break;
            case '*': cout << "= " << (a * b) << "\\n"; break;
            case '/':
                if (b == 0) cout << "Ошибка: деление на ноль\\n";
                else cout << "= " << (a / b) << "\\n";
                break;
            default:
                cout << "Неизвестная операция: " << op << "\\n";
        }
    }
    return 0;
}
`,
  },
  {
    id: 'cpp-fstream',
    language: 'cpp',
    title: 'Файлы: ifstream / ofstream',
    description: 'Чтение из input.txt и запись результата в output.txt в рабочей области',
    code: `#include <fstream>
#include <iostream>
#include <string>
using namespace std;

int main() {
    ifstream in("input.txt");
    if (!in.is_open()) {
        cout << "Файл input.txt не найден. Создайте его в панели «Файлы».\\n";
        return 1;
    }

    ofstream out("output.txt");
    if (!out.is_open()) {
        cout << "Не удалось открыть output.txt для записи.\\n";
        return 1;
    }

    int sum = 0;
    int value = 0;
    int count = 0;
    while (in >> value) {
        sum += value;
        count++;
    }

    in.clear();
    string note;
    getline(in >> ws, note);

    out << "Количество чисел: " << count << "\\n";
    out << "Сумма: " << sum << "\\n";
    if (!note.empty()) {
        out << "Комментарий: " << note << "\\n";
    }
    out.close();

    cout << "Готово! Обработано чисел: " << count << ", сумма: " << sum << "\\n";
    cout << "Откройте output.txt в панели «Файлы», чтобы увидеть результат.\\n";
    return 0;
}
`,
  },
  {
    id: 'cpp-binary-fstream',
    language: 'cpp',
    title: 'Бинарные файлы (ios::binary)',
    description: 'Запись и чтение структур struct через ofstream::write и ifstream::read',
    code: `#include <fstream>
#include <iostream>
#include <cstring>
using namespace std;

struct Record {
    int id;
    double score;
    char name[12];
};

int main() {
    Record outItems[2] = {
        {101, 98.5, "Alice"},
        {102, 87.25, "Bob"}
    };

    ofstream out("records.bin", ios::out | ios::binary);
    out.write(reinterpret_cast<char*>(outItems), sizeof(outItems));
    out.close();

    ifstream in("records.bin", ios::in | ios::binary);
    Record item;
    cout << "sizeof(Record) = " << sizeof(Record) << " Б\\n";
    while (in.read(reinterpret_cast<char*>(&item), sizeof(Record))) {
        cout << "#" << item.id << " " << item.name << " -> " << item.score << "\\n";
    }
    in.close();
    return 0;
}
`,
  },
  {
    id: 'c-sum',
    language: 'c',
    title: 'Ввод и вывод (scanf / printf)',
    description: 'Базовый интерактивный пример на чистом C',
    code: DEFAULT_CODE.c,
  },
  {
    id: 'c-binary-stdio',
    language: 'c',
    title: 'Файлы на C (FILE* / fwrite / fread)',
    description: 'Бинарная запись и чтение структур через fopen, fwrite, fseek и fread',
    code: `#include <stdio.h>

struct Item {
    int id;
    double price;
    char label[12];
};

int main(void) {
    struct Item stock[2] = {
        {1, 19.99, "Notebook"},
        {2, 4.50, "Pencil"}
    };

    FILE* f = fopen("stock.bin", "wb");
    if (f == NULL) {
        printf("Не удалось открыть файл для записи.\\n");
        return 1;
    }
    size_t written = fwrite(stock, sizeof(struct Item), 2, f);
    fclose(f);
    printf("Записано записей: %zu (sizeof = %zu Б)\\n", written, sizeof(struct Item));

    FILE* rf = fopen("stock.bin", "rb");
    if (!rf) return 1;
    fseek(rf, 0, SEEK_END);
    long fileSize = ftell(rf);
    rewind(rf);

    struct Item loaded[2];
    size_t count = fread(loaded, sizeof(struct Item), 2, rf);
    fclose(rf);

    printf("Размер файла: %ld Б, прочитано: %zu\\n", fileSize, count);
    for (size_t i = 0; i < count; ++i) {
        printf("  [%d] %s — %.2f\\n", loaded[i].id, loaded[i].label, loaded[i].price);
    }
    return 0;
}
`,
  },
  {
    id: 'c-stats',
    language: 'c',
    title: 'Среднее и статистика массива',
    description: 'Динамический массив чисел на C с подсчётом среднего',
    code: `#include <stdio.h>
#include <stdlib.h>

int main(void) {
    int n;
    printf("Количество элементов: ");
    if (scanf("%d", &n) != 1 || n <= 0) {
        printf("Некорректный размер.\\n");
        return 0;
    }

    double *arr = (double *)malloc((size_t)n * sizeof(double));
    if (!arr) return 1;

    double sum = 0.0;
    printf("Введите %d чисел: ", n);
    for (int i = 0; i < n; ++i) {
        scanf("%lf", &arr[i]);
        sum += arr[i];
    }

    printf("Сумма: %.2f\\n", sum);
    printf("Среднее: %.2f\\n", sum / n);

    free(arr);
    return 0;
}
`,
  },
];
