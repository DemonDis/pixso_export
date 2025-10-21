// code.tsx

const { widget } = figma;
const { AutoLayout, Text, Input, useSyncedState } = widget;

function MyWidget() {
  // Используем useSyncedState для хранения данных, которые должны синхронизироваться между всеми, кто видит этот файл.
  const [name, setName] = useSyncedState("name", "Guest");
  const [inputText, setInputText] = useSyncedState("inputText", "");

  return (
    <AutoLayout
      direction="vertical"
      spacing={8}
      padding={16}
      cornerRadius={8}
      fill="#FFFFFF"
      stroke="#E5E5E5"
    >
      <Text fontSize={24} fontWeight="bold">
        Hello, {name}!
      </Text>

      <Input
        value={inputText}
        placeholder="Enter your name..."
        onTextEditEnd={(e) => setInputText(e.characters)}
      />

      <AutoLayout
        as="button" // Превращает AutoLayout в кнопку
        fill="#0D99FF"
        padding={8}
        cornerRadius={4}
        horizontalAlignItems="center"
        onClick={() => {
          setName(inputText || "Guest");
          setInputText("");
        }}
      >
        <Text fontSize={16} fill="#FFFFFF">
          Update Name
        </Text>
      </AutoLayout>
    </AutoLayout>
  );
}

widget.register(MyWidget); // Обязательная регистрация виджета