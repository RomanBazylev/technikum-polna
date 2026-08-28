/**
 * Заготовки в форме задания INF.04: экран входа, ряд кнопок с весами и
 * вариант на XAML для пути Visual Studio. Отдельно лежит демонстрация
 * gravity против layout_gravity, на которой ученики теряют баллы чаще всего.
 */
export type LayoutPreset = {
  id: string;
  label: string;
  dialect: 'Android XML' | 'XAML';
  source: string;
};

export const LAYOUT_PRESETS: readonly LayoutPreset[] = [
  {
    id: 'logowanie',
    label: 'Ekran logowania',
    dialect: 'Android XML',
    source: `<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="16">

    <TextView
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="Logowanie"
        android:textSize="24"
        android:gravity="center" />

    <EditText
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="24"
        android:hint="Login" />

    <EditText
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="8"
        android:hint="Hasło" />

    <Button
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginTop="16"
        android:layout_gravity="end"
        android:text="Zaloguj" />
</LinearLayout>`,
  },
  {
    id: 'wagi',
    label: 'Pasek przycisków z layout_weight',
    dialect: 'Android XML',
    source: `<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="horizontal"
    android:padding="8">

    <Button
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_weight="1"
        android:text="Dodaj" />

    <Button
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_weight="2"
        android:text="Zapisz" />

    <Button
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_weight="1"
        android:text="Usuń" />
</LinearLayout>`,
  },
  {
    id: 'kalkulator-xaml',
    label: 'Kalkulator na XAML',
    dialect: 'XAML',
    source: `<StackLayout Orientation="Vertical" Padding="16" BackgroundColor="#101820">
    <Label Text="Kalkulator ocen"
           FontSize="22"
           HorizontalTextAlignment="Center" />
    <Entry Placeholder="Podaj ocenę"
           Margin="0,16,0,0" />
    <Entry Placeholder="Podaj wagę"
           Margin="0,8,0,0" />
    <Button Text="Policz średnią"
            HorizontalOptions="Center"
            Margin="0,16,0,0" />
    <Label Text="Wynik: —"
           HorizontalTextAlignment="Center"
           Margin="0,12,0,0" />
</StackLayout>`,
  },
  {
    id: 'gravity',
    label: 'gravity kontra layout_gravity',
    dialect: 'Android XML',
    source: `<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="12">

    <TextView
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:background="#1d2b3a"
        android:padding="12"
        android:gravity="center"
        android:text="gravity=center: napis w środku pola" />

    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginTop="12"
        android:background="#3a2b1d"
        android:padding="12"
        android:layout_gravity="center"
        android:text="layout_gravity=center: pole w środku rodzica" />
</LinearLayout>`,
  },
];

export type QuizOption = { id: string; label: string; correct: boolean; why: string };

/**
 * Один вопрос, а не тест: путаница ровно одна, и объяснение важнее счёта.
 */
export const GRAVITY_QUIZ: {
  question: string;
  options: readonly QuizOption[];
} = {
  question:
    'Przycisk ma być dosunięty do prawej krawędzi ekranu. Który atrybut to robi?',
  options: [
    {
      id: 'layout_gravity',
      label: 'android:layout_gravity="end"',
      correct: true,
      why: 'layout_gravity mówi rodzicowi, gdzie postawić ten widok. To ustawia sam przycisk przy prawej krawędzi. · layout_gravity двигает сам виджет внутри родителя.',
    },
    {
      id: 'gravity',
      label: 'android:gravity="end"',
      correct: false,
      why: 'gravity układa zawartość wewnątrz widoku, czyli przesunie napis w prawo, a przycisk zostanie tam, gdzie był. · gravity двигает содержимое внутри виджета.',
    },
  ],
};
