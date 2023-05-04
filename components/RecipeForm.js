import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';

const RecipeForm = ({ onSave, onCancel, initialRecipe }) => {
  const [recipeName, setRecipeName] = useState(initialRecipe?.name || '');
  const [steps, setSteps] = useState(initialRecipe?.steps || []);

  const addStep = () => {
    setSteps([...steps, { description: '', duration: 0, autoNext: false, playSound: false }]);
  };

  const updateStep = (index, updatedStep) => {
    setSteps(steps.map((step, i) => (i === index ? updatedStep : step)));
  };

  const removeStep = (index) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    onSave({
      name: recipeName,
      steps: steps,
    });
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.formGroup}>
        <Text style={styles.label}>レシピ名</Text>
        <TextInput
          style={styles.input}
          value={recipeName}
          onChangeText={setRecipeName}
          placeholder="レシピ名を入力"
        />
      </View>

      {steps.map((step, index) => (
        <View key={index} style={styles.formGroup}>
          <Text style={styles.label}>ステップ {index + 1}</Text>
          <TextInput
            style={styles.input}
            value={step.description}
            onChangeText={(text) =>
              updateStep(index, { ...step, description: text })
            }
            placeholder="やること"
          />
          <TextInput
            style={styles.input}
            value={String(step.duration)}
            onChangeText={(text) =>
              updateStep(index, { ...step, duration: parseInt(text) || 0 })
            }
            keyboardType="number-pad"
            placeholder="必要な時間（秒）"
          />
          <View style={styles.formGroup}>
            <Text style={styles.label}>自動で次へ？</Text>
            <TouchableOpacity
              style={styles.checkbox}
              onPress={() =>
                updateStep(index, { ...step, autoNext: !step.autoNext })
              }
            >
              <Text style={styles.checkboxText}>{step.autoNext ? '✓' : ''}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.formGroup}>
            <Text style={styles.label}>最後に時報？</Text>
            <TouchableOpacity
              style={styles.checkbox}
              onPress={() =>
                updateStep(index, { ...step, playSound: !step.playSound })
              }
            >
              <Text style={styles.checkboxText}>{step.playSound ? '✓' : ''}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.removeStepButton}
            onPress={() => removeStep(index)}
          >
            <Text style={styles.removeStepButtonText}>このステップを削除</Text>
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity style={styles.addButton} onPress={addStep}>
        <Text style={styles.addButtonText}>新しいステップを追加</Text>
      </TouchableOpacity>

      <View style={styles.buttons}>
        <TouchableOpacity style={
          styles.button} onPress={handleSave}>
          <Text style={styles.buttonText}>保存</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={onCancel}>
          <Text style={styles.buttonText}>キャンセル</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
  },
  formGroup: {
    marginBottom: 10,
  },
  label: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 5,
  },
  checkbox: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 5,
  },
  checkboxText: {
    fontSize: 18,
  },
  removeStepButton: {
    backgroundColor: 'red',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    marginTop: 5,
  },
  removeStepButtonText: {
    color: 'white',
    fontSize: 16,
  },
  addButton: {
    backgroundColor: 'dodgerblue',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    marginBottom: 10,
  },
  addButtonText: {
    color: 'white',
    fontSize: 16,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    backgroundColor: 'dodgerblue',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
  },
});

export default RecipeForm;