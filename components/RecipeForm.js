import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Switch,
} from 'react-native';

const RecipeForm = ({ onSave, onCancel, initialRecipe }) => {
  const [recipeName, setRecipeName] = useState(initialRecipe ? initialRecipe.name : '');
  const [steps, setSteps] = useState(initialRecipe ? initialRecipe.steps : [{ description: '', duration: 0, autoNext: false, alarmBeforeEnd: false }]);

  const saveRecipe = () => {
    onSave({
      id: initialRecipe ? initialRecipe.id : null,
      name: recipeName,
      steps: steps.filter(step => step.description.trim() !== ''),
    });
  };

  const updateStep = (index, key, value) => {
    const newSteps = [...steps];
    newSteps[index][key] = value;
    setSteps(newSteps);
  };

  const removeStep = index => {
    const newSteps = [...steps];
    newSteps.splice(index, 1);
    setSteps(newSteps);
  };

  const addStep = () => {
    setSteps([...steps, { description: '', duration: 0, autoNext: false, alarmBeforeEnd: false }]);
  };

  return (
    <ScrollView>
      <View style={styles.container}>
        <Text style={styles.label}>レシピ名</Text>
        <TextInput
          style={styles.textInput}
          placeholder="レシピ名を入力"
          value={recipeName}
          onChangeText={setRecipeName}
        />
        {steps.map((step, index) => (
          <View key={index} style={styles.stepContainer}>
            <Text style={styles.label}>{`ステップ ${index + 1}`}</Text>
            <TextInput
              style={styles.textInput}
              placeholder="やること"
              value={step.description}
              onChangeText={value => updateStep(index, 'description', value)}
            />
            <View style={styles.durationContainer}>
              <Text style={styles.label}>所要時間（秒）</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="number-pad"
                value={step.duration.toString()}
                onChangeText={value => updateStep(index, 'duration', parseInt(value, 10) || 0)}
                placeholder="0"
              />
            </View>
            <View style={styles.switchContainer}>
              <Switch
                value={step.autoNext}
                onValueChange={value => updateStep(index, 'autoNext', value)}
              />
              <Text style={styles.switchLabel}>自動で次へ？</Text>
            </View>
            <View style={styles.switchContainer}>
              <Switch
                value={step.alarmBeforeEnd}
                onValueChange={value => updateStep(index, 'alarmBeforeEnd', value)}
                disabled={step.duration < 4}
              />
              <Text style={styles.switchLabel}>最後に時報？</Text>
            </View>
            <TouchableOpacity onPress={() => removeStep(index)}>
              <Text style={styles.removeStepButton}>このステップを削除</Text>
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity onPress={addStep} style={styles.addButton}>
          <Text style={styles.addButtonText}>新しいステップを追加</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={saveRecipe} style={styles.saveButton}>
          <Text style={styles.saveButtonText}>保存</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel} style={styles.cancelButton}>
          <Text style={styles.cancelButtonText}>キャンセル</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    marginTop: 36,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  textInput: {
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 4,
    fontSize: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 16,
  },
  stepContainer: {
    marginBottom: 16,
  },
  durationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  switchLabel: {
    marginLeft: 8,
    fontSize: 16,
  },
  removeStepButton: {
    color: 'red',
    fontSize: 16,
    textDecorationLine: 'underline',
  },
  addButton: {
    backgroundColor: '#4caf50',
    borderRadius: 4,
    padding: 8,
    marginBottom: 16,
  },
  addButtonText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
  },
  saveButton: {
    backgroundColor: '#2196f3',
    borderRadius: 4,
    padding: 8,
    marginBottom: 8,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
  },
  cancelButton: {
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 4,
    padding: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    textAlign: 'center',
  },
});

export default RecipeForm;
